import type { AdminSpeedDatingRegistrationDTO } from "@repo/shared-types";
import { SpeedDatingStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";

/**
 * Every registrant who opted into speed dating for the given event.
 *
 * CANCELLED rows are excluded (SEC-035). Leaving a session cannot delete the row — the
 * participant portal's database role holds no DELETE — so an opt-out survives as a status
 * change. Without this filter the panitia's list would keep showing people who left.
 */
export async function listEventSpeedDating(
  eventId: string,
): Promise<AdminSpeedDatingRegistrationDTO[]> {
  const rows = await prisma.speedDatingRegistration.findMany({
    where: { registration: { eventId }, status: { not: SpeedDatingStatus.CANCELLED } },
    include: { registration: { include: { user: true } } },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    registrationId: r.registrationId,
    userName: r.registration.user.name,
    userEmail: r.registration.user.email,
    sessionInfo: r.sessionInfo,
    status: r.status,
  }));
}
