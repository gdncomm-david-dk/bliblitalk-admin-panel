import {
  EventStatus,
  RegistrationStatus,
  type PortalEventFilter,
  type MyEventDTO,
  type EventDisplayConfig,
} from "@repo/shared-types";
import { prisma } from "../../../db/client";
import { AppError } from "../../../middleware/error";
import { toMyEventDTO } from "../../../lib/shared/mappers";

// seatsTaken only counts confirmed seats — WAITING/CANCELLED/REJECTED don't occupy capacity.
export const eventInclude = {
  speakers: true,
  _count: { select: { registrations: { where: { status: RegistrationStatus.REGISTERED } } } },
} as const;

// The portal never sees DRAFT or CANCELLED events.
const PORTAL_VISIBLE: EventStatus[] = [
  EventStatus.PUBLISHED,
  EventStatus.REGISTRATION_CLOSED,
  EventStatus.COMPLETED,
];

function portalStatusWhere(filter?: PortalEventFilter): EventStatus[] {
  if (filter === "upcoming") return [EventStatus.PUBLISHED, EventStatus.REGISTRATION_CLOSED];
  if (filter === "completed") return [EventStatus.COMPLETED];
  return PORTAL_VISIBLE;
}

// Small grace window before an ended event is swept to COMPLETED. Real users never
// notice a couple of minutes' delay; it just keeps this global sweep from racing
// fixtures elsewhere that intentionally use "now" as an event's end time.
const COMPLETION_GRACE_MS = 2 * 60 * 1000;

/**
 * Sweeps events whose end time has passed into COMPLETED, so nobody has to close
 * them out by hand. Called at every event read boundary (portal + admin) plus a
 * periodic background sweep in index.ts for paths that query events directly.
 *
 * Also flips displayConfig.pastEvent on, marking the event for the portal's Past
 * Event page. Each row is updated individually (rather than one updateMany) so its
 * other displayConfig flags — which vary per event — aren't clobbered.
 */
export async function completeExpiredEvents(): Promise<void> {
  const expiring = await prisma.event.findMany({
    where: {
      status: { in: [EventStatus.PUBLISHED, EventStatus.REGISTRATION_CLOSED] },
      endsAt: { lt: new Date(Date.now() - COMPLETION_GRACE_MS) },
    },
    select: { id: true, displayConfig: true },
  });
  if (expiring.length === 0) return;

  await Promise.all(
    expiring.map((event) =>
      prisma.event.update({
        where: { id: event.id },
        data: {
          status: EventStatus.COMPLETED,
          displayConfig: { ...(event.displayConfig as EventDisplayConfig), pastEvent: true },
        },
      }),
    ),
  );
}

export async function listEvents(filter?: PortalEventFilter) {
  await completeExpiredEvents();
  return prisma.event.findMany({
    where: { status: { in: portalStatusWhere(filter) } },
    include: eventInclude,
    orderBy: { startsAt: "asc" },
  });
}

export async function getEventBySlug(slug: string) {
  await completeExpiredEvents();
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
  if (event.status !== EventStatus.PUBLISHED) {
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
