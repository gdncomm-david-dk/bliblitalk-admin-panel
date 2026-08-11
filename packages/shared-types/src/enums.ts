// Single source of truth for domain enums. Mirrored by Prisma enums in the backend schema.

export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  EVENT_ADMIN: "EVENT_ADMIN",
  HR_TA: "HR_TA",
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
  REGISTRATION_OPEN: "REGISTRATION_OPEN",
  REGISTRATION_CLOSED: "REGISTRATION_CLOSED",
  ONGOING: "ONGOING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const SelectionMode = {
  FCFS: "FCFS",
  CURATED: "CURATED",
} as const;
export type SelectionMode = (typeof SelectionMode)[keyof typeof SelectionMode];

export const Attendance = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  PENDING: "PENDING",
} as const;
export type Attendance = (typeof Attendance)[keyof typeof Attendance];

export const ReminderKind = {
  CUSTOM: "CUSTOM",
  SHORTLIST_RESULT: "SHORTLIST_RESULT",
} as const;
export type ReminderKind = (typeof ReminderKind)[keyof typeof ReminderKind];

export const EmploymentType = {
  INTERNAL: "INTERNAL",
  EXTERNAL: "EXTERNAL",
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];
