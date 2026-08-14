import type { Role } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { logger } from "../../logger";

/**
 * SEC-011: records that an action touching participant PII happened, and who did it.
 *
 * Actions are string constants rather than an enum column so SEC-029 — which needs the same
 * trail for role grants, bulk email and participant decisions — can add its own without a
 * migration. Keep new values in this object so the set stays greppable.
 */
export const AuditAction = {
  REGISTRANT_EXPORT: "REGISTRANT_EXPORT",
  EVENT_PARTICIPANT_EXPORT: "EVENT_PARTICIPANT_EXPORT",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditEntry = {
  action: AuditAction;
  actorId: string;
  actorEmail: string;
  actorRole: Role;
  targetType?: string;
  targetId?: string;
  rowCount?: number;
  detail?: string;
};

/**
 * Writes one audit row.
 *
 * Failure to record is logged and swallowed rather than thrown. That is a real trade and it
 * goes this way round on purpose: this is an *advisory* accountability record on a read-only
 * export, so losing the row is bad, but failing the admin's export because the audit insert
 * hit a transient error would be worse. When SEC-029 extends this table to privileged
 * mutations — role grants especially — those call sites must make the write part of the same
 * transaction as the action, so the two cannot disagree. Do not copy this swallow there.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        actorRole: entry.actorRole,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        rowCount: entry.rowCount ?? null,
        detail: entry.detail ?? null,
      },
    });
  } catch (err) {
    // The actor's email is PII and stays out of stdout (CLAUDE.md) — the row that was supposed
    // to hold it is exactly what failed to write, so the log line carries the action and the
    // opaque id only. `actorId` is a cuid, not an identifier a log reader can resolve to a
    // person without database access they would need anyway.
    logger.error(
      { action: entry.action, actorId: entry.actorId, reason: err instanceof Error ? err.message : "unknown" },
      "Failed to write audit record",
    );
  }
}
