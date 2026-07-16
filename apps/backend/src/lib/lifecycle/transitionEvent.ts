import { EventStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { allowedFrom, canTransition } from "./transitions";

export type TransitionActor = { type: "ADMIN"; id: string } | { type: "SYSTEM" };

/**
 * The ONLY code path allowed to mutate event.status. Validates against the
 * transition table, then writes the new status + statusChangedAt and one
 * EventStatusHistory row in a single transaction. Side effects (P1 has none yet;
 * P2/P3 add certificate unlock, no-show finalization, cancellation email) run
 * AFTER commit and update sideEffectsStatus — a failed side effect never leaves
 * the status itself inconsistent.
 */
export async function transitionEvent(
  eventId: string,
  to: EventStatus,
  actor: TransitionActor,
  reason?: string,
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true },
  });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);

  const from = event.status;
  if (from === to) return; // idempotent no-op — scheduler may re-evaluate a boundary

  if (!canTransition(from, to)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot transition event from ${from} to ${to}`,
      409,
      { from, to, allowed: allowedFrom(from) },
    );
  }

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: { status: to, statusChangedAt: new Date() },
    }),
    prisma.eventStatusHistory.create({
      data: {
        eventId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.type === "ADMIN" ? actor.id : null,
        reason: reason ?? null,
        sideEffectsStatus: "NONE", // P1 has no side effects yet; P2/P3 set PENDING and resolve
      },
    }),
  ]);

  // Post-commit side effects land here in later phases (idempotent, update sideEffectsStatus).
}
