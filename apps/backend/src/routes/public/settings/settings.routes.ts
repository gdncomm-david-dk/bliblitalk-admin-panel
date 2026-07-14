import { Router } from "express";
import {
  getAdminLoginCarousel,
  getFeedbackSettings,
  getPortalLoginCarousel,
} from "../../admin/adminModuleSettings.service";
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

// GET /site-settings/login-carousel-admin
settingsRoutes.get("/login-carousel-admin", async (_req, res, next) => {
  try {
    res.json(await getAdminLoginCarousel());
  } catch (err) {
    next(err);
  }
});

// GET /site-settings/login-carousel-portal
settingsRoutes.get("/login-carousel-portal", async (_req, res, next) => {
  try {
    res.json(await getPortalLoginCarousel());
  } catch (err) {
    next(err);
  }
});
