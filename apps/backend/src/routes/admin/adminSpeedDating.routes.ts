import { Router } from "express";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { requireEventAccess } from "../../middleware/eventScope";
import { listEventSpeedDating } from "./adminSpeedDating.service";

export const adminSpeedDatingRoutes = Router();

// GET /admin/events/:id/speed-dating
adminSpeedDatingRoutes.get(
  "/events/:id/speed-dating",
  requireAuth,
  requirePermission(Permission.SPEEDDATING_MANAGE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await listEventSpeedDating(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);
