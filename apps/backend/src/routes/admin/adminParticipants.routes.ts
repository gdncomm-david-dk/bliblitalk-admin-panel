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
  participantCsv,
  rejectRegistration,
  shortlistRegistration,
  waitlistRegistration,
} from "./adminParticipants.service";
import { AuditAction, recordAudit } from "../../lib/shared/auditLog";

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

// GET /admin/events/:id/registrations/export — SEC-011: bulk participant PII export.
//
// Three gates, and all three are load-bearing: PARTICIPANT_READ says you may see this event's
// participants at all, REGISTRANT_EXPORT says you may take a copy of their contact details out
// of the system, and requireEventAccess says it must be *your* event. An EVENT_ADMIN keeps the
// first and third and loses the second — they can still work the list on screen.
adminParticipantsRoutes.get(
  "/events/:id/registrations/export",
  requireAuth,
  requirePermission(Permission.PARTICIPANT_READ),
  requirePermission(Permission.REGISTRANT_EXPORT),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      const eventId = req.params.id!;
      const rows = await listEventRegistrations(eventId);

      // Written before the response, so a client that disconnects mid-download still leaves a
      // record that the rows were read out of the database.
      await recordAudit({
        action: AuditAction.EVENT_PARTICIPANT_EXPORT,
        actorId: req.userId!,
        actorEmail: req.userEmail!,
        actorRole: req.userRole!,
        targetType: "Event",
        targetId: eventId,
        rowCount: rows.length,
      });

      const filename = `participants-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(participantCsv(rows));
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
