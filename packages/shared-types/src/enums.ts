// Single source of truth for domain enums. Mirrored by Prisma enums in the backend schema.

export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  EVENT_ADMIN: "EVENT_ADMIN",
  HR_TA: "HR_TA",
  VIEWER: "VIEWER",
  PARTICIPANT: "PARTICIPANT",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const RegistrationStatus = {
  REGISTERED: "REGISTERED",
  WAITING: "WAITING",
  REJECTED: "REJECTED",
  SHORTLISTED: "SHORTLISTED",
  CANCELLED: "CANCELLED",
} as const;
export type RegistrationStatus = (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const EventStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  REGISTRATION_CLOSED: "REGISTRATION_CLOSED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const Attendance = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  PENDING: "PENDING",
} as const;
export type Attendance = (typeof Attendance)[keyof typeof Attendance];
