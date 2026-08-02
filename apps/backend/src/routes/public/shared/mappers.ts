import type { Announcement, Feedback, Registration, SpeedDatingRegistration } from "@prisma/client";
import type { AnnouncementDTO, MyEventDTO } from "@repo/shared-types";
import { toEventDTO, type EventWithRelations } from "../../../lib/shared/mappers";

export function toAnnouncementDTO(a: Announcement): AnnouncementDTO {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    publishedAt: a.publishedAt.toISOString(),
    pinned: a.pinned,
  };
}

type RegistrationWithRelations = Registration & {
  event: EventWithRelations;
  speedDating?: SpeedDatingRegistration | null;
  feedback?: Feedback | null;
};

/** Shared by GET /me/events and the register/cancel actions so the shape never drifts. */
export function toMyEventDTO(
  r: RegistrationWithRelations,
  certEventIds: ReadonlySet<string>,
): MyEventDTO {
  return {
    id: r.id,
    event: toEventDTO(r.event),
    status: r.status,
    attendance: r.attendance,
    certificateAvailable: certEventIds.has(r.eventId) || r.attendance === "PRESENT",
    feedbackSubmitted: r.feedback != null,
    speedDatingCompleted: r.speedDating?.status === "COMPLETED",
    speedDating: r.speedDating
      ? { status: r.speedDating.status, sessionInfo: r.speedDating.sessionInfo }
      : null,
  };
}
