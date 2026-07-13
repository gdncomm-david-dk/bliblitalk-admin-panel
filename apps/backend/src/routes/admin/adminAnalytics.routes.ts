import { Router } from "express";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { getAdminAnalytics } from "./adminAnalytics.service";

export const adminAnalyticsRoutes = Router();

// GET /admin/analytics
adminAnalyticsRoutes.get(
  "/analytics",
  requireAuth,
  requirePermission(Permission.ANALYTICS_READ),
  async (req, res, next) => {
    try {
      res.json(await getAdminAnalytics(req.userId!, req.userRole!));
    } catch (err) {
      next(err);
    }
  },
);
