import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth";
import { getDashboard } from "./dashboard.service";

export const dashboardRoutes = Router();

// GET /me/dashboard
dashboardRoutes.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const data = await getDashboard(req.userId!);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
