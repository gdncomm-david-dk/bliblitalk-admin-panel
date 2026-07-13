import { Router } from "express";
import { Permission } from "@repo/auth";
import { CreateReminderInput } from "@repo/shared-types";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { requireEventAccess } from "../../middleware/eventScope";
import { validate } from "../../middleware/validate";
import { cancelReminder, createReminder, listReminders } from "./adminReminders.service";

export const adminRemindersRoutes = Router();

// GET /admin/events/:id/reminders
adminRemindersRoutes.get(
  "/events/:id/reminders",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await listReminders(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/events/:id/reminders
adminRemindersRoutes.post(
  "/events/:id/reminders",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  requireEventAccess("id"),
  validate(CreateReminderInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await createReminder(req.params.id!, req.body));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/events/:id/reminders/:reminderId
adminRemindersRoutes.delete(
  "/events/:id/reminders/:reminderId",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      await cancelReminder(req.params.id!, req.params.reminderId!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
