import { DEFAULT_DISPLAY_CONFIG, EventStatus } from "@repo/shared-types";
import type {
  AdminEventInput,
  AdminEventUpdateInput,
  EventDisplayConfig,
  EventDTO,
  Role,
} from "@repo/shared-types";
import { isEventScoped } from "@repo/auth";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { completeExpiredEvents, eventInclude } from "../public/events/events.service";
import { toEventDTO } from "../../lib/shared/mappers";
import { transitionEvent } from "../../lib/lifecycle/transitionEvent";

function mergeDisplayConfig(
  existing: unknown,
  patch: Partial<EventDisplayConfig>,
): EventDisplayConfig {
  const base =
    typeof existing === "object" && existing !== null
      ? { ...DEFAULT_DISPLAY_CONFIG, ...(existing as Partial<EventDisplayConfig>) }
      : DEFAULT_DISPLAY_CONFIG;
  return { ...base, ...patch };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Appends -2, -3, … until the slug is free. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.event.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function listAdminEvents(
  userId: string,
  role: Role,
  status?: EventStatus,
): Promise<EventDTO[]> {
  await completeExpiredEvents();
  const where = {
    ...(isEventScoped(role) ? { admins: { some: { id: userId } } } : {}),
    ...(status ? { status } : {}),
  };
  const events = await prisma.event.findMany({
    where,
    include: eventInclude,
    orderBy: { startsAt: "asc" },
  });
  return events.map(toEventDTO);
}

export async function getAdminEvent(id: string): Promise<EventDTO> {
  await completeExpiredEvents();
  const event = await prisma.event.findUnique({ where: { id }, include: eventInclude });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);
  return toEventDTO(event);
}

export async function createAdminEvent(
  ownerId: string,
  input: AdminEventInput,
): Promise<EventDTO> {
  const slug = await uniqueSlug(input.slug ?? slugify(input.title));
  const event = await prisma.event.create({
    data: {
      title: input.title,
      slug,
      subtitle: input.subtitle ?? null,
      eventCode: input.eventCode ?? null,
      bannerUrl: input.bannerUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      description: input.description,
      category: input.category,
      tags: input.tags,
      location: input.location,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      capacity: input.capacity,
      showRemainingSeats: input.showRemainingSeats,
      hasSpeedDating: input.hasSpeedDating,
      enableCertificate: input.enableCertificate,
      enableFeedback: input.enableFeedback,
      waitingListEnabled: input.waitingListEnabled,
      venue: input.venue ?? null,
      mapsUrl: input.mapsUrl ?? null,
      registrationDeadline: input.registrationDeadline ? new Date(input.registrationDeadline) : null,
      selectionMode: input.selectionMode,
      registrationOpensAt: input.registrationOpensAt ? new Date(input.registrationOpensAt) : null,
      eventType: input.eventType ?? null,
      dressCode: input.dressCode ?? null,
      language: input.language ?? null,
      organizedBy: input.organizedBy ?? null,
      importantNotes: input.importantNotes ?? null,
      learningPoints: input.learningPoints ?? [],
      galleryImages: input.galleryImages ?? [],
      recordingUrl: input.recordingUrl ?? null,
      presentationUrl: input.presentationUrl ?? null,
      displayConfig: mergeDisplayConfig(null, input.displayConfig ?? {}),
      status: EventStatus.DRAFT,
      ownerId,
      admins: { connect: [{ id: ownerId }] },
      ...(input.speakerIds !== undefined && {
        speakers: { connect: input.speakerIds.map((id) => ({ id })) },
      }),
    },
    include: eventInclude,
  });
  return toEventDTO(event);
}

export async function updateAdminEvent(
  id: string,
  input: AdminEventUpdateInput,
): Promise<EventDTO> {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Event not found", 404);

  const slug = input.slug ? await uniqueSlug(input.slug, id) : undefined;

  const event = await prisma.event.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(slug !== undefined && { slug }),
      ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
      ...(input.eventCode !== undefined && { eventCode: input.eventCode }),
      ...(input.bannerUrl !== undefined && { bannerUrl: input.bannerUrl }),
      ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.startsAt !== undefined && { startsAt: new Date(input.startsAt) }),
      ...(input.endsAt !== undefined && { endsAt: new Date(input.endsAt) }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      ...(input.showRemainingSeats !== undefined && {
        showRemainingSeats: input.showRemainingSeats,
      }),
      ...(input.hasSpeedDating !== undefined && { hasSpeedDating: input.hasSpeedDating }),
      ...(input.enableCertificate !== undefined && { enableCertificate: input.enableCertificate }),
      ...(input.enableFeedback !== undefined && { enableFeedback: input.enableFeedback }),
      ...(input.waitingListEnabled !== undefined && {
        waitingListEnabled: input.waitingListEnabled,
      }),
      ...(input.venue !== undefined && { venue: input.venue }),
      ...(input.mapsUrl !== undefined && { mapsUrl: input.mapsUrl }),
      ...(input.registrationDeadline !== undefined && {
        registrationDeadline: input.registrationDeadline ? new Date(input.registrationDeadline) : null,
      }),
      ...(input.selectionMode !== undefined && { selectionMode: input.selectionMode }),
      ...(input.registrationOpensAt !== undefined && {
        registrationOpensAt: input.registrationOpensAt ? new Date(input.registrationOpensAt) : null,
      }),
      ...(input.eventType !== undefined && { eventType: input.eventType }),
      ...(input.dressCode !== undefined && { dressCode: input.dressCode }),
      ...(input.language !== undefined && { language: input.language }),
      ...(input.organizedBy !== undefined && { organizedBy: input.organizedBy }),
      ...(input.importantNotes !== undefined && { importantNotes: input.importantNotes }),
      ...(input.learningPoints !== undefined && { learningPoints: input.learningPoints }),
      ...(input.galleryImages !== undefined && { galleryImages: input.galleryImages }),
      ...(input.recordingUrl !== undefined && { recordingUrl: input.recordingUrl }),
      ...(input.presentationUrl !== undefined && { presentationUrl: input.presentationUrl }),
      ...(input.displayConfig !== undefined && {
        displayConfig: mergeDisplayConfig(existing.displayConfig, input.displayConfig),
      }),
      ...(input.speakerIds !== undefined && {
        speakers: { set: input.speakerIds.map((id) => ({ id })) },
      }),
    },
    include: eventInclude,
  });
  return toEventDTO(event);
}

/** Only DRAFT events with no registrations may be hard-deleted; otherwise cancel instead. */
export async function deleteAdminEvent(id: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { registrations: true } } },
  });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);
  if (event.status !== EventStatus.DRAFT || event._count.registrations > 0) {
    throw new AppError(
      "CANNOT_DELETE",
      "Only draft events with no registrations can be deleted. Cancel it instead.",
      400,
    );
  }
  await prisma.event.delete({ where: { id } });
}

const REQUIRED_FOR_PUBLISH: (keyof AdminEventInput)[] = [
  "title",
  "description",
  "category",
  "location",
  "startsAt",
  "endsAt",
];

/** Sets publishedAt the first time an event reaches PUBLISHED. Not a status write, so it's fine outside the engine. */
async function ensurePublishedAt(id: string, to: EventStatus): Promise<void> {
  if (to !== EventStatus.PUBLISHED) return;
  const existing = await prisma.event.findUnique({ where: { id }, select: { publishedAt: true } });
  if (existing && existing.publishedAt === null) {
    await prisma.event.update({ where: { id }, data: { publishedAt: new Date() } });
  }
}

export async function publishAdminEvent(id: string, actorId: string): Promise<EventDTO> {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Event not found", 404);
  const missing = REQUIRED_FOR_PUBLISH.filter((field) => !existing[field as keyof typeof existing]);
  if (missing.length > 0) {
    throw new AppError("INCOMPLETE_EVENT", `Missing required fields: ${missing.join(", ")}`, 422);
  }
  await transitionEvent(id, EventStatus.PUBLISHED, { type: "ADMIN", id: actorId });
  await ensurePublishedAt(id, EventStatus.PUBLISHED);
  return getAdminEvent(id);
}

/**
 * Closes registration on a live event without cancelling it (REGISTRATION_OPEN ->
 * REGISTRATION_CLOSED per the transition table). transitionEvent enforces legality —
 * no hand-rolled status guard needed here.
 */
export async function closeAdminEventRegistration(id: string, actorId: string): Promise<EventDTO> {
  await transitionEvent(id, EventStatus.REGISTRATION_CLOSED, { type: "ADMIN", id: actorId });
  return getAdminEvent(id);
}

/**
 * Opens (or reopens) registration (PUBLISHED -> REGISTRATION_OPEN, or the "manual
 * reopen" REGISTRATION_CLOSED -> REGISTRATION_OPEN — both legal per the transition
 * table). transitionEvent enforces legality — no hand-rolled status guard needed here.
 */
export async function openAdminEventRegistration(id: string, actorId: string): Promise<EventDTO> {
  await transitionEvent(id, EventStatus.REGISTRATION_OPEN, { type: "ADMIN", id: actorId });
  return getAdminEvent(id);
}

export async function cancelAdminEvent(id: string, actorId: string): Promise<EventDTO> {
  await transitionEvent(id, EventStatus.CANCELLED, { type: "ADMIN", id: actorId });
  return getAdminEvent(id);
}

/**
 * Manual override: forces status to any value the admin picks, skipping the guided
 * actions' own domain checks (e.g. publish's required-fields check) — but, like every
 * other status write, it is validated against the transition table by transitionEvent,
 * which throws 409 INVALID_TRANSITION for an illegal jump. Note that events past their
 * endsAt are re-flipped to COMPLETED by the sweep (completeExpiredEvents, see
 * events.service.ts) on the very next read, so forcing a truly-expired event back to
 * PUBLISHED/REGISTRATION_CLOSED won't stick — that's the sweep's intended time-based
 * behavior, not a bug in this override.
 */
export async function setAdminEventStatus(
  id: string,
  status: EventStatus,
  actorId: string,
): Promise<EventDTO> {
  await transitionEvent(id, status, { type: "ADMIN", id: actorId });
  await ensurePublishedAt(id, status);
  return getAdminEvent(id);
}
