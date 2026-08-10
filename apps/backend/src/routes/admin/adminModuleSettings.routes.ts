import { Router } from "express";
import { Permission } from "@repo/auth";
import {
  CertificateSettingsDTO,
  FeedbackSettingsDTO,
  LoginCarouselSettingsDTO,
  TestimonialsSettingsDTO,
  SpeedDatingSettingsDTO,
} from "@repo/shared-types";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import {
  getAdminLoginCarousel,
  getCertificateSettings,
  getFeedbackSettings,
  getLandingTestimonials,
  getPortalLoginCarousel,
  getSpeedDatingSettings,
  setAdminLoginCarousel,
  setCertificateSettings,
  setFeedbackSettings,
  setLandingTestimonials,
  setPortalLoginCarousel,
  setSpeedDatingSettings,
} from "../../lib/shared/moduleSettings.service";

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

// GET /admin/settings/login-carousel-admin
adminModuleSettingsRoutes.get(
  "/settings/login-carousel-admin",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await getAdminLoginCarousel());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/settings/login-carousel-admin
adminModuleSettingsRoutes.put(
  "/settings/login-carousel-admin",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  validate(LoginCarouselSettingsDTO),
  async (req, res, next) => {
    try {
      res.json(await setAdminLoginCarousel(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/settings/login-carousel-portal
adminModuleSettingsRoutes.get(
  "/settings/login-carousel-portal",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await getPortalLoginCarousel());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/settings/login-carousel-portal
adminModuleSettingsRoutes.put(
  "/settings/login-carousel-portal",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  validate(LoginCarouselSettingsDTO),
  async (req, res, next) => {
    try {
      res.json(await setPortalLoginCarousel(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/settings/testimonials
adminModuleSettingsRoutes.get(
  "/settings/testimonials",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await getLandingTestimonials());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/settings/testimonials — replaces the whole list, so add/remove/reorder are all
// just "save the array you now have". There is no per-item id to keep in sync.
adminModuleSettingsRoutes.put(
  "/settings/testimonials",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  validate(TestimonialsSettingsDTO),
  async (req, res, next) => {
    try {
      res.json(await setLandingTestimonials(req.body));
    } catch (err) {
      next(err);
    }
  },
);
