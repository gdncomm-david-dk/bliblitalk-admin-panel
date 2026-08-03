import { EventStatus, allowedFrom, canTransition } from "@repo/shared-types";
import type { EventDisplayConfig } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { logger } from "../../logger";

export type TransitionActor = { type: "ADMIN"; id: string } | { type: "SYSTEM" };

/**
 * The ONLY code path allowed to mutate event.status. Validates against the
 * transition table, then writes the new status + statusChangedAt and one
 * EventStatusHistory row in a single transaction, using a status-guarded
 * compare-and-swap (updateMany WHERE id AND status=from) so a concurrent
 * racer that read the same stale status can never both commit — the loser's
 * write matches zero rows and creates no history (no double-audit). This is
 * what makes it safe for the P2 scheduler to run on N sweep replicas, or to
 * race a concurrent admin action, without ever corrupting the audit trail.
 *
 * COMPLETED side effects (clearing isOverdue, flipping displayConfig.pastEvent)
 * run AFTER commit, tracked via sideEffectsStatus (PENDING -> DONE|FAILED) on
 * the history row — a failed side effect never leaves the status write itself
 * inconsistent.
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

  const hasSideEffects = to === EventStatus.COMPLETED;

  const historyId = await prisma.$transaction(async (tx) => {
    const result = await tx.event.updateMany({
      where: { id: eventId, status: from },
      data: { status: to, statusChangedAt: new Date() },
    });
    if (result.count === 0) return null; // lost the race — status moved under us

    const history = await tx.eventStatusHistory.create({
      data: {
        eventId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.type === "ADMIN" ? actor.id : null,
        reason: reason ?? null,
        sideEffectsStatus: hasSideEffects ? "PENDING" : "NONE",
      },
    });
    return history.id;
  });

  if (historyId === null) {
    // Lost the race: give the caller an accurate outcome instead of a false
    // silent success. Idempotent if the racer reached the same target we
    // wanted; otherwise a fresh 409 reflecting the actual current status.
    const after = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
    if (!after) throw new AppError("NOT_FOUND", "Event not found", 404);
    if (after.status === to) return;
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot transition event from ${after.status} to ${to}`,
      409,
      { from: after.status, to, allowed: allowedFrom(after.status) },
    );
  }

  if (hasSideEffects) {
    await resolveCompletedSideEffects(eventId, historyId);
  }
}

/**
 * Post-commit side effects for reaching COMPLETED. Best-effort: a failure here
 * is logged and recorded on the history row, never thrown — the status
 * transition already committed and must not be rolled back by this.
 */
async function resolveCompletedSideEffects(eventId: string, historyId: string): Promise<void> {
  try {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { displayConfig: true } });
    await prisma.event.update({
      where: { id: eventId },
      data: {
        isOverdue: false,
        displayConfig: { ...(event?.displayConfig as EventDisplayConfig), pastEvent: true },
      },
    });
    await prisma.eventStatusHistory.update({ where: { id: historyId }, data: { sideEffectsStatus: "DONE" } });
  } catch (err) {
    logger.error({ err, eventId }, "transitionEvent: failed to resolve COMPLETED side effects");
    await prisma.eventStatusHistory
      .update({ where: { id: historyId }, data: { sideEffectsStatus: "FAILED" } })
      .catch(() => {});
  }
}
