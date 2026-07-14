import type { EventReminder } from "@prisma/client";
import { ReminderKind, RegistrationStatus } from "@repo/shared-types";
import type { CreateReminderInput, EventReminderDTO } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { sendBulkEmail } from "../../lib/shared/mailer";

function toEventReminderDTO(r: EventReminder): EventReminderDTO {
  return {
    id: r.id,
    eventId: r.eventId,
    kind: r.kind as EventReminderDTO["kind"],
    sendAt: r.sendAt.toISOString(),
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    subjectNotShortlisted: r.subjectNotShortlisted,
    bodyHtmlNotShortlisted: r.bodyHtmlNotShortlisted,
    status: r.status as EventReminderDTO["status"],
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    recipientCount: r.recipientCount,
    sentCount: r.sentCount,
    failedCount: r.failedCount,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listReminders(eventId: string): Promise<EventReminderDTO[]> {
  const reminders = await prisma.eventReminder.findMany({
    where: { eventId },
    orderBy: { sendAt: "asc" },
  });
  return reminders.map(toEventReminderDTO);
}

export async function createReminder(
  eventId: string,
  input: CreateReminderInput,
): Promise<EventReminderDTO> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);

  if (new Date(input.sendAt).getTime() <= Date.now()) {
    throw new AppError("INVALID_SEND_TIME", "Reminder send time must be in the future", 400);
  }

  const reminder = await prisma.eventReminder.create({
    data: {
      eventId,
      kind: input.kind,
      sendAt: new Date(input.sendAt),
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      subjectNotShortlisted: input.subjectNotShortlisted ?? null,
      bodyHtmlNotShortlisted: input.bodyHtmlNotShortlisted ?? null,
      status: "PENDING",
    },
  });
  return toEventReminderDTO(reminder);
}

export async function cancelReminder(eventId: string, reminderId: string): Promise<void> {
  const reminder = await prisma.eventReminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.eventId !== eventId) {
    throw new AppError("NOT_FOUND", "Reminder not found", 404);
  }
  if (reminder.status !== "PENDING") {
    throw new AppError("ALREADY_SENT", "This reminder has already been sent", 400);
  }
  await prisma.eventReminder.delete({ where: { id: reminderId } });
}

type Recipient = { email: string; name: string };

/** CUSTOM reminders (e.g. "event starts soon") only make sense for confirmed attendees. */
async function sendCustomReminder(reminder: EventReminder): Promise<void> {
  const registrations = await prisma.registration.findMany({
    where: { eventId: reminder.eventId, status: RegistrationStatus.SHORTLISTED },
    include: { user: { select: { email: true, name: true } } },
  });
  const recipients: Recipient[] = registrations.map((r) => ({ email: r.user.email, name: r.user.name }));
  const result = await sendBulkEmail(recipients, reminder.subject, reminder.bodyHtml);
  await prisma.eventReminder.update({
    where: { id: reminder.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      recipientCount: recipients.length,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
    },
  });
}

/**
 * SHORTLIST_RESULT reminders notify every still-active registrant of their outcome —
 * one send, two audiences: shortlisted get subject/bodyHtml, everyone else (REGISTERED/
 * WAITING/REJECTED, i.e. not CANCELLED and not SHORTLISTED) gets the "not shortlisted"
 * variant. Both fields are guaranteed present by CreateReminderInput's validation for
 * this kind — the guard below only protects against unexpected null data.
 */
async function sendShortlistResultReminder(reminder: EventReminder): Promise<void> {
  if (!reminder.subjectNotShortlisted || !reminder.bodyHtmlNotShortlisted) {
    throw new AppError(
      "MISSING_CONTENT",
      "SHORTLIST_RESULT reminder is missing its not-shortlisted message",
      500,
    );
  }

  const registrations = await prisma.registration.findMany({
    where: { eventId: reminder.eventId, status: { not: RegistrationStatus.CANCELLED } },
    include: { user: { select: { email: true, name: true } } },
  });
  const shortlisted: Recipient[] = registrations
    .filter((r) => r.status === RegistrationStatus.SHORTLISTED)
    .map((r) => ({ email: r.user.email, name: r.user.name }));
  const others: Recipient[] = registrations
    .filter((r) => r.status !== RegistrationStatus.SHORTLISTED)
    .map((r) => ({ email: r.user.email, name: r.user.name }));

  const [shortlistedResult, othersResult] = await Promise.all([
    sendBulkEmail(shortlisted, reminder.subject, reminder.bodyHtml),
    sendBulkEmail(others, reminder.subjectNotShortlisted, reminder.bodyHtmlNotShortlisted),
  ]);

  await prisma.eventReminder.update({
    where: { id: reminder.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      recipientCount: registrations.length,
      sentCount: shortlistedResult.sentCount + othersResult.sentCount,
      failedCount: shortlistedResult.failedCount + othersResult.failedCount,
    },
  });
}

/**
 * Background sweep: sends every reminder whose `sendAt` has arrived. Processed per-row
 * (not a single updateMany) since each reminder needs its own recipient list and send
 * result. One failing reminder doesn't stop the others from being processed.
 */
export async function sweepDueReminders(): Promise<void> {
  const due = await prisma.eventReminder.findMany({
    where: { status: "PENDING", sendAt: { lte: new Date() } },
  });

  for (const reminder of due) {
    try {
      if (reminder.kind === ReminderKind.SHORTLIST_RESULT) {
        await sendShortlistResultReminder(reminder);
      } else {
        await sendCustomReminder(reminder);
      }
    } catch {
      try {
        await prisma.eventReminder.update({
          where: { id: reminder.id },
          data: { status: "FAILED" },
        });
      } catch {
        // best-effort; keep sweeping the remaining reminders
      }
    }
  }
}
