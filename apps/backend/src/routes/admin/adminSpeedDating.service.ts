import type { AdminSpeedDatingRegistrationDTO } from "@repo/shared-types";
import { prisma } from "../../db/client";

/** Every registrant who opted into speed dating for the given event. */
export async function listEventSpeedDating(
  eventId: string,
): Promise<AdminSpeedDatingRegistrationDTO[]> {
  const rows = await prisma.speedDatingRegistration.findMany({
    where: { registration: { eventId } },
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
