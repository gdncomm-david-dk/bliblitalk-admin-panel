import type { Event, EventCategory, Speaker } from "@prisma/client";
import type {
  AgendaItemDTO,
  DiscussionPointDTO,
  EventDisplayConfig,
  EventDTO,
  FaqItemDTO,
  LearningPointDTO,
  SpeakerDTO,
} from "@repo/shared-types";
import { DEFAULT_DISPLAY_CONFIG, computeNextAutoTransition } from "@repo/shared-types";

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

export type EventWithRelations = Event & {
  speakers: Speaker[];
  category: EventCategory;
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
    category: e.category.name,
    categoryId: e.categoryId,
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
    statusChangedAt: e.statusChangedAt.toISOString(),
    isOverdue: e.isOverdue,
    selectionMode: e.selectionMode,
    registrationOpensAt: e.registrationOpensAt?.toISOString() ?? null,
    nextAutoTransition: computeNextAutoTransition(e),
  };
}
