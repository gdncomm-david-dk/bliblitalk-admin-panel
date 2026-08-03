import type { AdminAnalyticsDTO, EventAttendanceDTO, Role } from "@repo/shared-types";
import { Attendance, RegistrationStatus } from "@repo/shared-types";
import { isEventScoped } from "@repo/auth";
import { prisma } from "../../db/client";

/** Basic platform analytics, scoped to an EVENT_ADMIN's assigned events. */
export async function getAdminAnalytics(userId: string, role: Role): Promise<AdminAnalyticsDTO> {
  const scoped = isEventScoped(role);
  const eventWhere = scoped ? { admins: { some: { id: userId } } } : {};
  const registrationWhere = scoped ? { event: { admins: { some: { id: userId } } } } : {};

  const [categoryGroups, statusGroups, events] = await Promise.all([
    prisma.event.groupBy({ by: ["categoryId"], where: eventWhere, _count: { _all: true } }),
    prisma.registration.groupBy({ by: ["status"], where: registrationWhere, _count: { _all: true } }),
    prisma.event.findMany({
      where: eventWhere,
      select: {
        id: true,
        title: true,
        registrations: {
          where: { status: { not: RegistrationStatus.CANCELLED } },
          select: { attendance: true },
        },
      },
    }),
  ]);

  const eventAttendance: EventAttendanceDTO[] = events.map((e) => {
    const registrations = e.registrations.length;
    const present = e.registrations.filter((r) => r.attendance === Attendance.PRESENT).length;
    return {
      eventId: e.id,
      title: e.title,
      registrations,
      present,
      attendanceRate: registrations > 0 ? Math.round((present / registrations) * 100) : 0,
    };
  });

  const topEventsByRegistrations = [...eventAttendance]
    .sort((a, b) => b.registrations - a.registrations)
    .slice(0, 5);

  const categoryNameById = new Map(
    (
      await prisma.eventCategory.findMany({
        where: { id: { in: categoryGroups.map((g) => g.categoryId) } },
        select: { id: true, name: true },
      })
    ).map((c) => [c.id, c.name]),
  );

  return {
    eventsByCategory: categoryGroups
      .map((g) => ({ category: categoryNameById.get(g.categoryId) ?? "Unknown", count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    registrationsByStatus: statusGroups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    topEventsByRegistrations,
    eventAttendance,
  };
}
