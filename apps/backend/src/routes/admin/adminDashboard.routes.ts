import { Router } from "express";
import { ADMIN_ROLES } from "@repo/auth";
import { requireAuth, requireRole } from "../../middleware/requireAuth";
import { getAdminDashboard } from "./adminDashboard.service";

export const adminDashboardRoutes = Router();

// GET /admin/dashboard
adminDashboardRoutes.get(
  "/dashboard",
  requireAuth,
  requireRole(ADMIN_ROLES),
  async (req, res, next) => {
    try {
      const data = await getAdminDashboard(req.userId!, req.userRole!);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);
