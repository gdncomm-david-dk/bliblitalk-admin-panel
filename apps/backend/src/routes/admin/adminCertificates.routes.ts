import { Router } from "express";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { requireEventAccess } from "../../middleware/eventScope";
import { generateCertificatesForEvent, listEventCertificates } from "./adminCertificates.service";

export const adminCertificatesRoutes = Router();

// GET /admin/events/:id/certificates
adminCertificatesRoutes.get(
  "/events/:id/certificates",
  requireAuth,
  requirePermission(Permission.CERTIFICATE_MANAGE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await listEventCertificates(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/events/:id/certificates/generate
adminCertificatesRoutes.post(
  "/events/:id/certificates/generate",
  requireAuth,
  requirePermission(Permission.CERTIFICATE_MANAGE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await generateCertificatesForEvent(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);
