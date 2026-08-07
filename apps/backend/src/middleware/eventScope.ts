import type { RequestHandler } from "express";
import type { Role } from "@repo/shared-types";
import { isEventScoped } from "@repo/auth";
import { prisma } from "../db/client";
import { AppError } from "./error";

/**
 * Whether a user may act on a specific event.
 *
 * Non-event-scoped roles (SUPER_ADMIN, HR_TA) pass this check — their access
 * is gated upstream by `requireRole` and the RBAC permission matrix. EVENT_ADMIN is
 * additionally restricted to events it is assigned to (`Event.admins`).
 */
export async function canAccessEvent(
  role: Role,
  userId: string,
  eventId: string,
): Promise<boolean> {
  if (!isEventScoped(role)) return true;
  const count = await prisma.event.count({
    where: { id: eventId, admins: { some: { id: userId } } },
  });
  return count > 0;
}

/**
 * Middleware factory enforcing event ownership for scoped roles. Reads the event id
 * from `req.params[param]`. Must run after requireAuth (+ typically requireRole).
 */
export function requireEventAccess(param = "eventId"): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.userId || !req.userRole) {
        return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
      }
      const eventId = req.params[param];
      if (!eventId) return next(new AppError("BAD_REQUEST", `Missing ${param}`, 400));
      const ok = await canAccessEvent(req.userRole, req.userId, eventId);
      if (!ok) return next(new AppError("FORBIDDEN", "Not assigned to this event", 403));
      next();
    } catch (err) {
      next(err);
    }
  };
}
