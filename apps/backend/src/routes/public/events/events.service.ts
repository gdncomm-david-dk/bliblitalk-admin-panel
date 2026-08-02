import { EventStatus, RegistrationStatus, type PortalEventFilter, type MyEventDTO } from "@repo/shared-types";
import { prisma } from "../../../db/client";
import { AppError } from "../../../middleware/error";
import { toMyEventDTO } from "../shared/mappers";
import { eventInclude } from "../../../lib/shared/eventInclude";

// The portal never sees DRAFT or CANCELLED events. REGISTRATION_OPEN and ONGOING are
// the new live states (reachable in P1 via the open-registration action and the manual
// /transition endpoint); they must stay visible so live events don't vanish.
const PORTAL_VISIBLE: EventStatus[] = [
  EventStatus.PUBLISHED,
  EventStatus.REGISTRATION_OPEN,
  EventStatus.REGISTRATION_CLOSED,
  EventStatus.ONGOING,
  EventStatus.COMPLETED,
];

function portalStatusWhere(filter?: PortalEventFilter): EventStatus[] {
  if (filter === "upcoming")
    return [EventStatus.PUBLISHED, EventStatus.REGISTRATION_OPEN, EventStatus.REGISTRATION_CLOSED];
  if (filter === "completed") return [EventStatus.COMPLETED];
  return PORTAL_VISIBLE;
}

export async function listEvents(filter?: PortalEventFilter) {
  return prisma.event.findMany({
    where: { status: { in: portalStatusWhere(filter) } },
    include: eventInclude,
    orderBy: { startsAt: "asc" },
  });
}

export async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: eventInclude,
  });
}

/**
 * Creates or reactivates a registration for the given user/event.
 * Instantly REGISTERED while capacity remains, otherwise auto-waitlisted (WAITING).
 * Swap `decideInitialStatus` for an approval-gate check once an admin CMS ships.
 */
export async function registerForEvent(
  userId: string,
  slug: string,
  joinSpeedDating: boolean,
): Promise<MyEventDTO> {
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);
  if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.REGISTRATION_OPEN) {
    throw new AppError("EVENT_CLOSED", "This event is no longer open for registration", 400);
  }
  const now = new Date();
  if (event.registrationOpensAt && now < event.registrationOpensAt) {
    throw new AppError("REGISTRATION_NOT_OPEN", "Registration has not opened yet", 400);
  }
  if (event.registrationDeadline && now > event.registrationDeadline) {
    throw new AppError("EVENT_CLOSED", "The registration deadline has passed", 400);
  }

  const existing = await prisma.registration.findUnique({
    where: { userId_eventId: { userId, eventId: event.id } },
  });
  // Only a previously CANCELLED registration may be re-created; REJECTED is a terminal
  // admin decision, and any active status is a duplicate.
  if (existing && existing.status !== RegistrationStatus.CANCELLED) {
    throw new AppError("ALREADY_REGISTERED", "You are already registered for this event", 409);
  }

  const registeredCount = await prisma.registration.count({
    where: { eventId: event.id, status: RegistrationStatus.REGISTERED },
  });
  const isFull = event.capacity > 0 && registeredCount >= event.capacity;
  if (isFull && !event.waitingListEnabled) {
    throw new AppError("EVENT_FULL", "This event is full", 400);
  }
  const status = decideInitialStatus(registeredCount, event.capacity, event.showRemainingSeats);

  const registration = await prisma.registration.upsert({
    where: { userId_eventId: { userId, eventId: event.id } },
    create: { userId, eventId: event.id, status },
    update: { status, attendance: "PENDING", cancelledAt: null },
    include: { event: { include: eventInclude }, speedDating: true, feedback: true },
  });

  const withSpeedDating =
    event.hasSpeedDating && joinSpeedDating
      ? await prisma.registration.update({
          where: { id: registration.id },
          data: { speedDating: { upsert: { create: {}, update: {} } } },
          include: { event: { include: eventInclude }, speedDating: true, feedback: true },
        })
      : registration;

  const certificates = await prisma.certificate.findMany({
    where: { userId },
    select: { eventId: true },
  });
  return toMyEventDTO(withSpeedDating, new Set(certificates.map((c) => c.eventId)));
}

function decideInitialStatus(
  registeredCount: number,
  capacity: number,
  showRemainingSeats: boolean,
): "REGISTERED" | "WAITING" {
  // Shortlist-only events (seat count hidden): no instant confirmation — every
  // registrant waits until an admin shortlists them.
  if (!showRemainingSeats) return RegistrationStatus.WAITING;
  return capacity > 0 && registeredCount >= capacity
    ? RegistrationStatus.WAITING
    : RegistrationStatus.REGISTERED;
}
