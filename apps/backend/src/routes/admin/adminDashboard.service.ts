import type { AdminDashboardDTO, Role } from "@repo/shared-types";
import { EventStatus, RegistrationStatus, Attendance } from "@repo/shared-types";
import { isEventScoped } from "@repo/auth";
import { prisma } from "../../db/client";

const UPCOMING_STATUSES: EventStatus[] = [EventStatus.PUBLISHED, EventStatus.REGISTRATION_CLOSED];

/**
 * Assembles the Admin CMS dashboard payload. EVENT_ADMIN is scoped to the events
 * it administers (`Event.admins`); other admin roles see the whole platform.
 */
export async function getAdminDashboard(userId: string, role: Role): Promise<AdminDashboardDTO> {
  const scoped = isEventScoped(role);
  const eventWhere = scoped ? { admins: { some: { id: userId } } } : {};
  const registrationWhere = scoped ? { event: { admins: { some: { id: userId } } } } : {};
  const speedDatingWhere = scoped
    ? { registration: { event: { admins: { some: { id: userId } } } } }
    : {};
  const certificateWhere = scoped ? { event: { admins: { some: { id: userId } } } } : {};

  const [
    totalEvents,
    upcomingEvents,
    totalRegistrations,
    presentCount,
    shortlistedCount,
    speedDatingParticipants,
    certificatesIssued,
    recentRegs,
    upcomingCalendarRaw,
  ] = await Promise.all([
    prisma.event.count({ where: eventWhere }),
    prisma.event.count({ where: { ...eventWhere, status: { in: UPCOMING_STATUSES } } }),
    prisma.registration.count({
      where: { ...registrationWhere, status: { not: RegistrationStatus.CANCELLED } },
    }),
    prisma.registration.count({
      where: { ...registrationWhere, attendance: Attendance.PRESENT },
    }),
    prisma.registration.count({
      where: { ...registrationWhere, status: RegistrationStatus.SHORTLISTED },
    }),
    prisma.speedDatingRegistration.count({ where: speedDatingWhere }),
    prisma.certificate.count({ where: certificateWhere }),
    prisma.registration.findMany({
      where: registrationWhere,
      include: { user: true, event: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.event.findMany({
      where: { ...eventWhere, status: { in: UPCOMING_STATUSES } },
      include: { _count: { select: { registrations: true } } },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
  ]);

  const attendanceRate =
    totalRegistrations > 0 ? Math.round((presentCount / totalRegistrations) * 100) : 0;

  return {
    stats: {
      totalEvents,
      upcomingEvents,
      totalRegistrations,
      attendanceRate,
      shortlistedCount,
      speedDatingParticipants,
      certificatesIssued,
    },
    recentRegistrations: recentRegs.map((r) => ({
      id: r.id,
      userName: r.user.name,
      eventTitle: r.event.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    upcomingCalendar: upcomingCalendarRaw.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      status: e.status,
      registrationsCount: e._count.registrations,
      capacity: e.capacity,
    })),
  };
}
