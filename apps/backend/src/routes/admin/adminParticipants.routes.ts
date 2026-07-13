import { Router, type Request } from "express";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { requireEventAccess, canAccessEvent } from "../../middleware/eventScope";
import { AppError } from "../../middleware/error";
import {
  checkInRegistration,
  getRegistrationEventId,
  listEventRegistrations,
  markAbsentRegistration,
  rejectRegistration,
  shortlistRegistration,
  waitlistRegistration,
} from "./adminParticipants.service";

export const adminParticipantsRoutes = Router();

// GET /admin/events/:id/registrations
adminParticipantsRoutes.get(
  "/events/:id/registrations",
  requireAuth,
  requirePermission(Permission.PARTICIPANT_READ),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      const registrations = await listEventRegistrations(req.params.id!);
      res.json(registrations);
    } catch (err) {
      next(err);
    }
  },
);

// A registration's event isn't in the URL, so scope-check it against the
// registration's own eventId rather than via the requireEventAccess middleware.
async function requireRegistrationAccess(req: Request): Promise<void> {
  const eventId = await getRegistrationEventId(req.params.id!);
  const ok = await canAccessEvent(req.userRole!, req.userId!, eventId);
  if (!ok) throw new AppError("FORBIDDEN", "Not assigned to this event", 403);
}

// POST /admin/registrations/:id/shortlist
adminParticipantsRoutes.post(
  "/registrations/:id/shortlist",
  requireAuth,
  requirePermission(Permission.PARTICIPANT_SHORTLIST),
  async (req, res, next) => {
    try {
      await requireRegistrationAccess(req);
      res.json(await shortlistRegistration(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/registrations/:id/reject
adminParticipantsRoutes.post(
  "/registrations/:id/reject",
  requireAuth,
  requirePermission(Permission.PARTICIPANT_SHORTLIST),
  async (req, res, next) => {
    try {
      await requireRegistrationAccess(req);
      res.json(await rejectRegistration(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/registrations/:id/waitlist — reverts a shortlisted registration.
adminParticipantsRoutes.post(
  "/registrations/:id/waitlist",
  requireAuth,
  requirePermission(Permission.PARTICIPANT_SHORTLIST),
  async (req, res, next) => {
    try {
      await requireRegistrationAccess(req);
      res.json(await waitlistRegistration(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/registrations/:id/check-in
adminParticipantsRoutes.post(
  "/registrations/:id/check-in",
  requireAuth,
  requirePermission(Permission.ATTENDANCE_MANAGE),
  async (req, res, next) => {
    try {
      await requireRegistrationAccess(req);
      res.json(await checkInRegistration(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/registrations/:id/mark-absent
adminParticipantsRoutes.post(
  "/registrations/:id/mark-absent",
  requireAuth,
  requirePermission(Permission.ATTENDANCE_MANAGE),
  async (req, res, next) => {
    try {
      await requireRegistrationAccess(req);
      res.json(await markAbsentRegistration(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);
