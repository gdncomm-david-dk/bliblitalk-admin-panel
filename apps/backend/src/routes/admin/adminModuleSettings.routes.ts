import { Router } from "express";
import { Permission } from "@repo/auth";
import { CertificateSettingsDTO, FeedbackSettingsDTO, SpeedDatingSettingsDTO } from "@repo/shared-types";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import {
  getCertificateSettings,
  getFeedbackSettings,
  getSpeedDatingSettings,
  setCertificateSettings,
  setFeedbackSettings,
  setSpeedDatingSettings,
} from "./adminModuleSettings.service";

export const adminModuleSettingsRoutes = Router();

// GET /admin/settings/speed-dating
adminModuleSettingsRoutes.get(
  "/settings/speed-dating",
  requireAuth,
  requirePermission(Permission.SPEEDDATING_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await getSpeedDatingSettings());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/settings/speed-dating
adminModuleSettingsRoutes.put(
  "/settings/speed-dating",
  requireAuth,
  requirePermission(Permission.SPEEDDATING_MANAGE),
  validate(SpeedDatingSettingsDTO),
  async (req, res, next) => {
    try {
      res.json(await setSpeedDatingSettings(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/settings/feedback
adminModuleSettingsRoutes.get(
  "/settings/feedback",
  requireAuth,
  requirePermission(Permission.EVENT_READ),
  async (_req, res, next) => {
    try {
      res.json(await getFeedbackSettings());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/settings/feedback
adminModuleSettingsRoutes.put(
  "/settings/feedback",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  validate(FeedbackSettingsDTO),
  async (req, res, next) => {
    try {
      res.json(await setFeedbackSettings(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/settings/certificate
adminModuleSettingsRoutes.get(
  "/settings/certificate",
  requireAuth,
  requirePermission(Permission.CERTIFICATE_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await getCertificateSettings());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/settings/certificate
adminModuleSettingsRoutes.put(
  "/settings/certificate",
  requireAuth,
  requirePermission(Permission.CERTIFICATE_MANAGE),
  validate(CertificateSettingsDTO),
  async (req, res, next) => {
    try {
      res.json(await setCertificateSettings(req.body));
    } catch (err) {
      next(err);
    }
  },
);
