import { Router } from "express";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { requireEventAccess } from "../../middleware/eventScope";
import { getEventFeedback } from "./adminFeedback.service";

export const adminFeedbackRoutes = Router();

// GET /admin/events/:id/feedback
adminFeedbackRoutes.get(
  "/events/:id/feedback",
  requireAuth,
  requirePermission(Permission.EVENT_READ),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await getEventFeedback(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);
