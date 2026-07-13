import { Attendance, RegistrationStatus, type FeedbackInput, type MyEventDTO } from "@repo/shared-types";
import { prisma } from "../../../db/client";
import { AppError } from "../../../middleware/error";
import { eventInclude } from "../events/events.service";
import { toMyEventDTO } from "../../../lib/shared/mappers";
import { generateVerificationCode } from "../../../lib/shared/certificateCode";
import { getCertificateSettings } from "../../admin/adminModuleSettings.service";
import { renderCertificatePdf } from "./certificate.pdf";

/**
 * Cancels a registration by marking it CANCELLED (frees the seat; surfaces as
 * "Cancelled" in My Events). No auto-promotion of waitlisted registrants yet.
 */
export async function cancelRegistration(userId: string, registrationId: string): Promise<MyEventDTO> {
  const existing = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!existing) throw new AppError("NOT_FOUND", "Registration not found", 404);
  if (existing.userId !== userId) throw new AppError("FORBIDDEN", "Not your registration", 403);
  if (existing.status === RegistrationStatus.CANCELLED) {
    throw new AppError("ALREADY_CANCELLED", "This registration is already cancelled", 400);
  }

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: { status: RegistrationStatus.CANCELLED, cancelledAt: new Date() },
    include: { event: { include: eventInclude }, speedDating: true, feedback: true },
  });

  const certificates = await prisma.certificate.findMany({
    where: { userId },
    select: { eventId: true },
  });
  return toMyEventDTO(updated, new Set(certificates.map((c) => c.eventId)));
}

/**
 * Records a registrant's feedback submission. Only allowed once, after attendance
 * is marked PRESENT, and only for events with feedback enabled. Downloading a
 * certificate is gated on this submission when the event requires it.
 */
export async function submitFeedback(
  userId: string,
  registrationId: string,
  input: FeedbackInput,
): Promise<MyEventDTO> {
  const existing = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: true, feedback: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Registration not found", 404);
  if (existing.userId !== userId) throw new AppError("FORBIDDEN", "Not your registration", 403);
  if (existing.attendance !== Attendance.PRESENT) {
    throw new AppError("NOT_ATTENDED", "Feedback can only be submitted after attending the event", 400);
  }
  if (!existing.event.enableFeedback) {
    throw new AppError("FEEDBACK_DISABLED", "Feedback is not enabled for this event", 400);
  }
  if (existing.feedback) {
    throw new AppError("ALREADY_SUBMITTED", "Feedback has already been submitted", 400);
  }

  await prisma.feedback.create({
    data: { registrationId, userId, eventId: existing.eventId, ...input },
  });

  const updated = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { event: { include: eventInclude }, speedDating: true, feedback: true },
  });
  const certificates = await prisma.certificate.findMany({
    where: { userId },
    select: { eventId: true },
  });
  return toMyEventDTO(updated, new Set(certificates.map((c) => c.eventId)));
}

/**
 * Returns a downloadable certificate for an attended, certificated event, issuing
 * one on the fly on first request. If the event requires feedback, download is
 * blocked until the registrant has submitted it.
 */
export async function getCertificateDownload(
  userId: string,
  registrationId: string,
): Promise<{ filename: string; pdf: Buffer }> {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: true, feedback: true, user: true },
  });
  if (!registration) throw new AppError("NOT_FOUND", "Registration not found", 404);
  if (registration.userId !== userId) throw new AppError("FORBIDDEN", "Not your registration", 403);
  if (registration.attendance !== Attendance.PRESENT) {
    throw new AppError("NOT_ATTENDED", "Certificate is only available for attendees", 400);
  }
  if (registration.event.enableFeedback && !registration.feedback) {
    throw new AppError(
      "FEEDBACK_REQUIRED",
      "Please submit feedback before downloading your certificate",
      400,
    );
  }

  let certificate = await prisma.certificate.findFirst({
    where: { userId, eventId: registration.eventId },
  });
  if (!certificate) {
    if (!registration.event.enableCertificate) {
      throw new AppError("CERTIFICATES_DISABLED", "Certificates are not enabled for this event", 400);
    }
    // Self-service issuance: an attendee who has cleared the gates above can
    // generate their own certificate on first download, no admin step required.
    certificate = await prisma.certificate.create({
      data: { userId, eventId: registration.eventId, verificationCode: generateVerificationCode() },
    });
  }

  const issuedDate = certificate.issuedAt.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const certificateSettings = await getCertificateSettings();
  const pdf = await renderCertificatePdf(
    {
      name: registration.user.name,
      eventTitle: registration.event.title,
      date: issuedDate,
      certificateId: certificate.verificationCode,
    },
    certificateSettings,
  );
  return { filename: `certificate-${certificate.verificationCode}.pdf`, pdf };
}

async function loadOwnedRegistration(userId: string, registrationId: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: true, speedDating: true },
  });
  if (!registration) throw new AppError("NOT_FOUND", "Registration not found", 404);
  if (registration.userId !== userId) throw new AppError("FORBIDDEN", "Not your registration", 403);
  return registration;
}

async function reloadMyEvent(userId: string, registrationId: string): Promise<MyEventDTO> {
  const updated = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { event: { include: eventInclude }, speedDating: true, feedback: true },
  });
  const certificates = await prisma.certificate.findMany({
    where: { userId },
    select: { eventId: true },
  });
  return toMyEventDTO(updated, new Set(certificates.map((c) => c.eventId)));
}

/**
 * Opts an existing active registration into the event's speed dating session.
 * Idempotent — a second call while already joined is a no-op. Blocked once the
 * event has ended or the registration is cancelled/rejected.
 */
export async function joinSpeedDating(userId: string, registrationId: string): Promise<MyEventDTO> {
  const registration = await loadOwnedRegistration(userId, registrationId);
  if (!registration.event.hasSpeedDating) {
    throw new AppError("SPEED_DATING_DISABLED", "This event has no speed dating session", 400);
  }
  if (registration.status === RegistrationStatus.CANCELLED || registration.status === RegistrationStatus.REJECTED) {
    throw new AppError("INVALID_STATE", "Registration is not active", 400);
  }
  if (registration.event.endsAt.getTime() < Date.now()) {
    throw new AppError("EVENT_ENDED", "This event has already ended", 400);
  }
  if (!registration.speedDating) {
    await prisma.speedDatingRegistration.create({ data: { registrationId } });
  }
  return reloadMyEvent(userId, registrationId);
}

/** Removes an active registration from the event's speed dating session. */
export async function leaveSpeedDating(userId: string, registrationId: string): Promise<MyEventDTO> {
  const registration = await loadOwnedRegistration(userId, registrationId);
  if (registration.event.endsAt.getTime() < Date.now()) {
    throw new AppError("EVENT_ENDED", "This event has already ended", 400);
  }
  if (registration.speedDating) {
    await prisma.speedDatingRegistration.delete({ where: { registrationId } });
  }
  return reloadMyEvent(userId, registrationId);
}
