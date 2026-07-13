import { Router } from "express";
import { FeedbackInput } from "@repo/shared-types";
import { requireAuth } from "../../../middleware/requireAuth";
import { validate } from "../../../middleware/validate";
import {
  cancelRegistration,
  getCertificateDownload,
  joinSpeedDating,
  leaveSpeedDating,
  submitFeedback,
} from "./registrations.service";

export const registrationsRoutes = Router();

// POST /me/registrations/:id/cancel
registrationsRoutes.post("/registrations/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const myEvent = await cancelRegistration(req.userId!, req.params.id!);
    res.json(myEvent);
  } catch (err) {
    next(err);
  }
});

// POST /me/registrations/:id/feedback
registrationsRoutes.post(
  "/registrations/:id/feedback",
  requireAuth,
  validate(FeedbackInput),
  async (req, res, next) => {
    try {
      const myEvent = await submitFeedback(req.userId!, req.params.id!, req.body as FeedbackInput);
      res.status(201).json(myEvent);
    } catch (err) {
      next(err);
    }
  },
);

// POST /me/registrations/:id/speed-dating — join the event's speed dating session
registrationsRoutes.post("/registrations/:id/speed-dating", requireAuth, async (req, res, next) => {
  try {
    res.status(201).json(await joinSpeedDating(req.userId!, req.params.id!));
  } catch (err) {
    next(err);
  }
});

// DELETE /me/registrations/:id/speed-dating — leave the event's speed dating session
registrationsRoutes.delete("/registrations/:id/speed-dating", requireAuth, async (req, res, next) => {
  try {
    res.json(await leaveSpeedDating(req.userId!, req.params.id!));
  } catch (err) {
    next(err);
  }
});

// GET /me/registrations/:id/certificate
registrationsRoutes.get("/registrations/:id/certificate", requireAuth, async (req, res, next) => {
  try {
    const { filename, pdf } = await getCertificateDownload(req.userId!, req.params.id!);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});
