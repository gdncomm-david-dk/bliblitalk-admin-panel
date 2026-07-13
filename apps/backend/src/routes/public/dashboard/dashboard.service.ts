import { EventStatus, RegistrationStatus, type DashboardDTO } from "@repo/shared-types";
import { prisma } from "../../../db/client";
import { toUserDTO } from "../auth/auth.service";
import { toEventDTO } from "../../../lib/shared/mappers";

const eventInclude = {
  speakers: true,
  _count: { select: { registrations: true } },
} as const;

// Upcoming, portal-visible events (open or closed-for-registration but not past/draft/cancelled).
const UPCOMING_VISIBLE: EventStatus[] = [
  EventStatus.PUBLISHED,
  EventStatus.REGISTRATION_CLOSED,
];

/** Assembles the authenticated dashboard payload in a single call. */
export async function getDashboard(userId: string): Promise<DashboardDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const [
    registered,
    shortlisted,
    attended,
    certificates,
    featured,
    recommended,
    upcomingEvents,
    nextReg,
  ] = await Promise.all([
    prisma.registration.count({
      where: { userId, status: { not: RegistrationStatus.CANCELLED } },
    }),
    prisma.registration.count({ where: { userId, status: "SHORTLISTED" } }),
    prisma.registration.count({ where: { userId, attendance: "PRESENT" } }),
    prisma.certificate.count({ where: { userId } }),
    prisma.event.findFirst({ where: { featured: true }, include: eventInclude }),
    prisma.event.findMany({
      where: { recommended: true },
      include: eventInclude,
      orderBy: { startsAt: "asc" },
      take: 3,
    }),
    prisma.event.findMany({
      where: { status: { in: UPCOMING_VISIBLE } },
      include: eventInclude,
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
    prisma.registration.findFirst({
      where: {
        userId,
        status: { not: RegistrationStatus.CANCELLED },
        event: { status: { in: UPCOMING_VISIBLE } },
      },
      include: { event: { include: eventInclude } },
      orderBy: { event: { startsAt: "asc" } },
    }),
  ]);

  return {
    user: toUserDTO(user),
    featuredEvent: featured ? toEventDTO(featured) : null,
    stats: { registered, shortlisted, attended, certificates },
    recommended: recommended.map(toEventDTO),
    nextEvent: nextReg ? { event: toEventDTO(nextReg.event), status: nextReg.status } : null,
    upcomingEvents: upcomingEvents.map(toEventDTO),
  };
}
