import { Router } from "express";
import { Permission } from "@repo/auth";
import { SiteSettingsDTO } from "@repo/shared-types";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import { getSiteSettings, setSiteSettings } from "../../lib/shared/siteSettings.service";

export const adminSiteSettingsRoutes = Router();

// GET /admin/settings/site
adminSiteSettingsRoutes.get(
  "/settings/site",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await getSiteSettings());
    } catch (err) {
      next(err);
    }
  },
);

// PUT /admin/settings/site
adminSiteSettingsRoutes.put(
  "/settings/site",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  validate(SiteSettingsDTO),
  async (req, res, next) => {
    try {
      res.json(await setSiteSettings(req.body));
    } catch (err) {
      next(err);
    }
  },
);
