import type {
  Announcement,
  Certificate,
  Event,
  Feedback,
  Registration,
  Speaker,
  SpeedDatingRegistration,
} from "@prisma/client";
import type {
  AgendaItemDTO,
  AnnouncementDTO,
  CertificateDTO,
  DiscussionPointDTO,
  EventDisplayConfig,
  EventDTO,
  FaqItemDTO,
  LearningPointDTO,
  MyEventDTO,
  SpeakerDTO,
} from "@repo/shared-types";
import { DEFAULT_DISPLAY_CONFIG } from "@repo/shared-types";

export function toSpeakerDTO(s: Speaker): SpeakerDTO {
  return {
    id: s.id,
    name: s.name,
    title: s.title,
    company: s.company,
    bioShort: s.bioShort,
    bioLong: s.bioLong,
    credentials: s.credentials,
    avatarUrl: s.avatarUrl,
    featured: s.featured,
  };
}

type EventWithRelations = Event & {
  speakers: Speaker[];
  _count?: { registrations: number };
};

// CMS content is stored as Json; cast at the read boundary since seed/CMS writes are trusted.
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asDisplayConfig(value: unknown): EventDisplayConfig {
  if (typeof value !== "object" || value === null) return DEFAULT_DISPLAY_CONFIG;
  return { ...DEFAULT_DISPLAY_CONFIG, ...(value as Partial<EventDisplayConfig>) };
}

export function toEventDTO(e: EventWithRelations): EventDTO {
  return {
    id: e.id,
    slug: e.slug,
    eventCode: e.eventCode,
    title: e.title,
    subtitle: e.subtitle,
    bannerUrl: e.bannerUrl,
    thumbnailUrl: e.thumbnailUrl,
    description: e.description,
    category: e.category,
    tags: e.tags,
    location: e.location,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    capacity: e.capacity,
    seatsTaken: e._count?.registrations ?? 0,
    showRemainingSeats: e.showRemainingSeats,
    status: e.status,
    hasSpeedDating: e.hasSpeedDating,
    enableCertificate: e.enableCertificate,
    enableFeedback: e.enableFeedback,
    waitingListEnabled: e.waitingListEnabled,
    venue: e.venue,
    mapsUrl: e.mapsUrl,
    speakers: e.speakers.map(toSpeakerDTO),
    registrationDeadline: e.registrationDeadline?.toISOString() ?? null,
    eventType: e.eventType,
    dressCode: e.dressCode,
    language: e.language,
    organizedBy: e.organizedBy,
    importantNotes: e.importantNotes,
    learningPoints: asArray<LearningPointDTO>(e.learningPoints),
    discussionPoints: asArray<DiscussionPointDTO>(e.discussionPoints),
    agenda: asArray<AgendaItemDTO>(e.agenda),
    faqs: asArray<FaqItemDTO>(e.faqs),
    galleryImages: e.galleryImages,
    recordingUrl: e.recordingUrl,
    presentationUrl: e.presentationUrl,
    displayConfig: asDisplayConfig(e.displayConfig),
  };
}

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

export function toCertificateDTO(c: Certificate & { event: Event }): CertificateDTO {
  return {
    id: c.id,
    eventTitle: c.event.title,
    issuedAt: c.issuedAt.toISOString(),
    verificationCode: c.verificationCode,
  };
}
