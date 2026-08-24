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

/**
 * Speed-dating opt-in state.
 *
 * Unlike everything above this is NOT a Postgres enum — `SpeedDatingRegistration.status` is a
 * plain `String` column — so this const is the only place the vocabulary is written down. Kept
 * here anyway so both apps agree on the spelling.
 *
 * CANCELLED exists because leaving a session cannot delete the row: `bliblitalk_public`, the
 * role the participant portal connects as, holds no DELETE on any table by design (SEC-028 /
 * SEC-031). Opting out is therefore an UPDATE to this column, and every reader must treat a
 * CANCELLED row as "not joined" rather than as a participant.
 */
export const SpeedDatingStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type SpeedDatingStatus = (typeof SpeedDatingStatus)[keyof typeof SpeedDatingStatus];
