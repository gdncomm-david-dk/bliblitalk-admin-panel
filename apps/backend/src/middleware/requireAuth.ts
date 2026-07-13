import type { RequestHandler } from "express";
import type { Role } from "@repo/shared-types";
import { can, type Permission } from "@repo/auth";
import { config } from "../config";
import { AppError } from "./error";
import { verifyToken } from "../routes/public/auth/auth.service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: Role;
    }
  }
}

/** Requires a valid session cookie; sets req.userId + req.userRole or throws 401. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[config.cookieName];
  if (!token) return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
  const payload = verifyToken(token);
  if (!payload) return next(new AppError("UNAUTHORIZED", "Invalid session", 401));
  req.userId = payload.sub;
  req.userRole = payload.role;
  next();
};

/**
 * Requires the authenticated user's role to be in `allowed`. Must run after
 * requireAuth. Throws 401 if unauthenticated, 403 if the role is not permitted.
 */
export function requireRole(allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.userRole) return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
    if (!allowed.includes(req.userRole)) {
      return next(new AppError("FORBIDDEN", "Insufficient role", 403));
    }
    next();
  };
}

/**
 * Requires the authenticated user's role to hold `permission` per the RBAC matrix.
 * Must run after requireAuth. Does not check event-scoping — pair with
 * requireEventAccess for endpoints acting on a specific event.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.userRole) return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
    if (!can(req.userRole, permission)) {
      return next(new AppError("FORBIDDEN", "Insufficient permission", 403));
    }
    next();
  };
}
