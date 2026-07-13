import { Router } from "express";
import { getFeedbackSettings } from "../../admin/adminModuleSettings.service";
import { getSiteSettings } from "./settings.service";

export const settingsRoutes = Router();

// GET /site-settings
settingsRoutes.get("/", async (_req, res, next) => {
  try {
    res.json(await getSiteSettings());
  } catch (err) {
    next(err);
  }
});

// GET /site-settings/feedback-questions
settingsRoutes.get("/feedback-questions", async (_req, res, next) => {
  try {
    res.json(await getFeedbackSettings());
  } catch (err) {
    next(err);
  }
});
