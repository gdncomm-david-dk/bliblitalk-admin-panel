import type { MyEventDTO } from "@repo/shared-types";
import { prisma } from "../../../db/client";
import { toMyEventDTO } from "../shared/mappers";
import { eventInclude } from "../../../lib/shared/eventInclude";

/** All of the user's registrations with event, status, attendance, cert + speed-dating flags. */
export async function getMyEvents(userId: string): Promise<MyEventDTO[]> {
  const [registrations, certificates] = await Promise.all([
    prisma.registration.findMany({
      where: { userId },
      include: { event: { include: eventInclude }, speedDating: true, feedback: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.certificate.findMany({ where: { userId }, select: { eventId: true } }),
  ]);

  const certEventIds = new Set(certificates.map((c) => c.eventId));
  return registrations.map((r) => toMyEventDTO(r, certEventIds));
}
