import type { EventReminder } from "@prisma/client";
import { RegistrationStatus } from "@repo/shared-types";
import type { CreateReminderInput, EventReminderDTO } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { sendBulkEmail } from "../../lib/shared/mailer";

function toEventReminderDTO(r: EventReminder): EventReminderDTO {
  return {
    id: r.id,
    eventId: r.eventId,
    sendAt: r.sendAt.toISOString(),
    subject: r.subject,
    bodyHtml: r.bodyHtml,
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
      sendAt: new Date(input.sendAt),
      subject: input.subject,
      bodyHtml: input.bodyHtml,
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

/**
 * Background sweep: sends every reminder whose `sendAt` has arrived to everyone still
 * actively registered for that event. Processed per-row (not a single updateMany) since
 * each reminder needs its own recipient list and send result. One failing reminder
 * doesn't stop the others from being processed.
 */
export async function sweepDueReminders(): Promise<void> {
  const due = await prisma.eventReminder.findMany({
    where: { status: "PENDING", sendAt: { lte: new Date() } },
  });

  for (const reminder of due) {
    try {
      const registrations = await prisma.registration.findMany({
        where: {
          eventId: reminder.eventId,
          status: { notIn: [RegistrationStatus.CANCELLED, RegistrationStatus.REJECTED] },
        },
        include: { user: { select: { email: true, name: true } } },
      });
      const recipients = registrations.map((r) => ({ email: r.user.email, name: r.user.name }));
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
