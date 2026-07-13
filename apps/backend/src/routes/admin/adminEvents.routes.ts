import { Router } from "express";
import { AdminEventInput, AdminEventListQuery, AdminEventUpdateInput } from "@repo/shared-types";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { requireEventAccess } from "../../middleware/eventScope";
import { validate } from "../../middleware/validate";
import {
  cancelAdminEvent,
  closeAdminEventRegistration,
  createAdminEvent,
  deleteAdminEvent,
  getAdminEvent,
  listAdminEvents,
  openAdminEventRegistration,
  publishAdminEvent,
  updateAdminEvent,
} from "./adminEvents.service";

export const adminEventsRoutes = Router();

// GET /admin/events?status=DRAFT
adminEventsRoutes.get(
  "/",
  requireAuth,
  requirePermission(Permission.EVENT_READ),
  validate(AdminEventListQuery, "query"),
  async (req, res, next) => {
    try {
      const { status } = req.query as AdminEventListQuery;
      const events = await listAdminEvents(req.userId!, req.userRole!, status);
      res.json(events);
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/events/:id
adminEventsRoutes.get(
  "/:id",
  requireAuth,
  requirePermission(Permission.EVENT_READ),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      const event = await getAdminEvent(req.params.id!);
      res.json(event);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/events
adminEventsRoutes.post(
  "/",
  requireAuth,
  requirePermission(Permission.EVENT_CREATE),
  validate(AdminEventInput),
  async (req, res, next) => {
    try {
      const event = await createAdminEvent(req.userId!, req.body as AdminEventInput);
      res.status(201).json(event);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/events/:id
adminEventsRoutes.patch(
  "/:id",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  requireEventAccess("id"),
  validate(AdminEventUpdateInput),
  async (req, res, next) => {
    try {
      const event = await updateAdminEvent(req.params.id!, req.body as AdminEventUpdateInput);
      res.json(event);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/events/:id
adminEventsRoutes.delete(
  "/:id",
  requireAuth,
  requirePermission(Permission.EVENT_DELETE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      await deleteAdminEvent(req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/events/:id/publish
adminEventsRoutes.post(
  "/:id/publish",
  requireAuth,
  requirePermission(Permission.EVENT_PUBLISH),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      const event = await publishAdminEvent(req.params.id!);
      res.json(event);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/events/:id/cancel
adminEventsRoutes.post(
  "/:id/cancel",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      const event = await cancelAdminEvent(req.params.id!);
      res.json(event);
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/events/:id/close-registration
adminEventsRoutes.post(
  "/:id/close-registration",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await closeAdminEventRegistration(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/events/:id/open-registration
adminEventsRoutes.post(
  "/:id/open-registration",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await openAdminEventRegistration(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);
