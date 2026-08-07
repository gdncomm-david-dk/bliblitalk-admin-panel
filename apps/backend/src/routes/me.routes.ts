import { Router } from "express";
import { AppError } from "../middleware/error";
import { requireAuth } from "../middleware/requireAuth";
import { toUserDTO } from "../lib/shared/auth.service";
import { prisma } from "../db/client";

/**
 * The app's own profile endpoint. The gateway's `GET /auth/api/me` tells the browser which
 * email is signed in, but nothing about this app — the CMS needs the User row's name, role
 * and avatar to render its shell and gate its navigation. That is app data, so it is served
 * from an app route.
 *
 * There is deliberately no login and no logout here. The gateway owns both: login is a
 * full-page navigation to /auth/ui/login and logout to /auth/logout, neither of which ever
 * reaches this service.
 */
export const meRoutes = Router();

// GET /api/me
meRoutes.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    // requireAuth just read this row, so a miss here means it was deleted mid-request.
    if (!user) throw new AppError("NO_ADMIN_ACCOUNT", "Account no longer exists", 403);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});
