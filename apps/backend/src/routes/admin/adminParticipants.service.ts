import type { Feedback, Registration, User } from "@prisma/client";
import { Attendance, RegistrationStatus } from "@repo/shared-types";
import type { AdminRegistrationDTO } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";

const registrationInclude = { user: true, feedback: true } as const;

function toAdminRegistrationDTO(
  r: Registration & { user: User; feedback: Feedback | null },
  certificateCode: string | null = null,
): AdminRegistrationDTO {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    userAvatarUrl: r.user.avatarUrl,
    userDepartment: r.user.department,
    userPosition: r.user.position,
    userYearsOfExperience: r.user.yearsOfExperience,
    status: r.status,
    attendance: r.attendance,
    createdAt: r.createdAt.toISOString(),
    shortlistedAt: r.shortlistedAt?.toISOString() ?? null,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    certificateCode,
    feedbackSubmitted: r.feedback !== null,
  };
}

async function findCertificateCode(userId: string, eventId: string): Promise<string | null> {
  const certificate = await prisma.certificate.findFirst({ where: { userId, eventId } });
  return certificate?.verificationCode ?? null;
}

export async function listEventRegistrations(eventId: string): Promise<AdminRegistrationDTO[]> {
  const [registrations, certificates] = await Promise.all([
    prisma.registration.findMany({
      where: { eventId },
      include: registrationInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.certificate.findMany({ where: { eventId } }),
  ]);
  const codesByUserId = new Map(certificates.map((c) => [c.userId, c.verificationCode]));
  return registrations.map((r) => toAdminRegistrationDTO(r, codesByUserId.get(r.userId) ?? null));
}

/** Loads a registration's eventId so callers can enforce event-scoped access. */
export async function getRegistrationEventId(registrationId: string): Promise<string> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { eventId: true },
  });
  if (!reg) throw new AppError("NOT_FOUND", "Registration not found", 404);
  return reg.eventId;
}

async function transitionRegistration(
  registrationId: string,
  from: RegistrationStatus[],
  to: RegistrationStatus,
  extra: Record<string, unknown> = {},
): Promise<AdminRegistrationDTO> {
  const existing = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!existing) throw new AppError("NOT_FOUND", "Registration not found", 404);
  if (!from.includes(existing.status)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot move a registration from ${existing.status} to ${to}`,
      400,
    );
  }
  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: { status: to, ...extra },
    include: registrationInclude,
  });
  return toAdminRegistrationDTO(updated, await findCertificateCode(updated.userId, updated.eventId));
}

export function shortlistRegistration(id: string) {
  return transitionRegistration(
    id,
    [RegistrationStatus.REGISTERED, RegistrationStatus.WAITING],
    RegistrationStatus.SHORTLISTED,
    { shortlistedAt: new Date() },
  );
}

export function rejectRegistration(id: string) {
  return transitionRegistration(
    id,
    [RegistrationStatus.REGISTERED, RegistrationStatus.WAITING, RegistrationStatus.SHORTLISTED],
    RegistrationStatus.REJECTED,
  );
}

/** Reverts a shortlisted registration back to the waiting list. */
export function waitlistRegistration(id: string) {
  return transitionRegistration(
    id,
    [RegistrationStatus.SHORTLISTED],
    RegistrationStatus.WAITING,
    { shortlistedAt: null },
  );
}

const NEVER_ATTENDS: RegistrationStatus[] = [RegistrationStatus.CANCELLED, RegistrationStatus.REJECTED];

async function setAttendance(id: string, attendance: Attendance): Promise<AdminRegistrationDTO> {
  const existing = await prisma.registration.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Registration not found", 404);
  if (NEVER_ATTENDS.includes(existing.status)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot record attendance for a ${existing.status} registration`,
      400,
    );
  }
  const updated = await prisma.registration.update({
    where: { id },
    data: {
      attendance,
      checkedInAt: attendance === Attendance.PRESENT ? new Date() : existing.checkedInAt,
    },
    include: registrationInclude,
  });
  return toAdminRegistrationDTO(updated, await findCertificateCode(updated.userId, updated.eventId));
}

export function checkInRegistration(id: string) {
  return setAttendance(id, Attendance.PRESENT);
}

export function markAbsentRegistration(id: string) {
  return setAttendance(id, Attendance.ABSENT);
}
