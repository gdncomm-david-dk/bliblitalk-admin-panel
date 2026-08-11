import type { RequestHandler } from "express";
import type { Role } from "@repo/shared-types";
import { can, isAdminRole, type Permission } from "@repo/auth";
import { AppError } from "./error";
import { prisma } from "../db/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: Role;
      userEmail?: string;
    }
  }
}

/** The gateway forwards the authenticated user's email here. Never set by a browser. */
export const USER_ID_HEADER = "x-user-id";

/**
 * Resolves the Apps Gateway user into this app's own account, or throws.
 *
 * There is no session to validate: the gateway authenticates at the edge and every
 * non-probe path is login-required, so a request that reaches a normal route has already
 * been through login and carries `X-User-Id` (the user's email). This app's only job is to
 * map that address onto a User row and its role.
 *
 * We deliberately do NOT strip or re-validate the header: in production the app is
 * reachable only through the gateway (no ingress of its own), and the gateway strips any
 * client-supplied value before setting its own. Stripping it here would discard the real
 * one too, since the two are indistinguishable at this point. Network isolation is the
 * control — see PROJECT.md "Login Method".
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const email = req.headers[USER_ID_HEADER];
  if (typeof email !== "string" || email.length === 0) {
    return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
  }

  // Wrapped because Express 4 does not catch a rejected promise from an `async` middleware:
  // it escapes as an unhandled rejection and Node exits. A transient database problem would
  // otherwise not fail the request, it would kill the process — which is exactly what took
  // this backend down once while Postgres was briefly unreachable. `next(err)` routes it
  // through errorHandler like every other failure, so the request 500s and the server lives.
  // eventScope.ts already does this; requireAuth was the one that did not.
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, email: true },
    });

    // 403, not 401: the gateway already signed this person in, so telling the browser to log
    // in again would just bounce them through the gateway and back into the same wall. These
    // two cases are what a staff account not existing, or a participant wandering in, look
    // like — the population split (repo-split decision 4) says this backend never serves
    // participants, and that guarantee used to live in the login handler's isAdminRole check.
    if (!user || !isAdminRole(user.role)) {
      return next(
        new AppError("NO_ADMIN_ACCOUNT", "No Admin CMS account for this user. Contact IT to get access.", 403),
      );
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.userEmail = user.email;
    next();
  } catch (err) {
    next(err);
  }
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
 *
 * This is the app layer of authorization and stays ours. The gateway's own `admin` flag
 * (from /auth/api/me) is about gateway app-management and is never reused as a role here.
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
