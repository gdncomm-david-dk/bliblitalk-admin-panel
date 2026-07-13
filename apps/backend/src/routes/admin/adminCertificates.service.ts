import type { Certificate, User } from "@prisma/client";
import { Attendance, RegistrationStatus } from "@repo/shared-types";
import type { AdminCertificateDTO, GenerateCertificatesResult } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { generateVerificationCode } from "../../lib/shared/certificateCode";

function toAdminCertificateDTO(c: Certificate & { user: User }): AdminCertificateDTO {
  return {
    id: c.id,
    userName: c.user.name,
    userEmail: c.user.email,
    verificationCode: c.verificationCode,
    issuedAt: c.issuedAt.toISOString(),
  };
}

export async function listEventCertificates(eventId: string): Promise<AdminCertificateDTO[]> {
  const certificates = await prisma.certificate.findMany({
    where: { eventId },
    include: { user: true },
    orderBy: { issuedAt: "desc" },
  });
  return certificates.map(toAdminCertificateDTO);
}

/**
 * Issues certificates for every attendee marked PRESENT who doesn't already have
 * one for this event. Skipped entirely if the event has certificates disabled.
 */
export async function generateCertificatesForEvent(
  eventId: string,
): Promise<GenerateCertificatesResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);
  if (!event.enableCertificate) {
    throw new AppError("CERTIFICATES_DISABLED", "Certificates are disabled for this event", 400);
  }

  const [attendees, existing] = await Promise.all([
    prisma.registration.findMany({
      where: {
        eventId,
        attendance: Attendance.PRESENT,
        status: { notIn: [RegistrationStatus.CANCELLED, RegistrationStatus.REJECTED] },
      },
      select: { userId: true },
    }),
    prisma.certificate.findMany({ where: { eventId }, select: { userId: true } }),
  ]);

  const alreadyIssued = new Set(existing.map((c) => c.userId));
  const toIssue = attendees.filter((a) => !alreadyIssued.has(a.userId));

  for (const { userId } of toIssue) {
    await prisma.certificate.create({
      data: { userId, eventId, verificationCode: generateVerificationCode() },
    });
  }

  const certificates = await listEventCertificates(eventId);
  return { generated: toIssue.length, certificates };
}
