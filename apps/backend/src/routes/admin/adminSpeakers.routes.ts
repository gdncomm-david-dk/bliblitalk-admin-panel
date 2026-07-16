import { Router } from "express";
import { CreateSpeakerInput, UpdateSpeakerInput } from "@repo/shared-types";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import { createSpeaker, deleteSpeaker, listSpeakers, updateSpeaker } from "./adminSpeakers.service";

export const adminSpeakersRoutes = Router();

// GET /admin/speakers?q=jane
adminSpeakersRoutes.get(
  "/speakers",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json(await listSpeakers(q));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/speakers
adminSpeakersRoutes.post(
  "/speakers",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  validate(CreateSpeakerInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await createSpeaker(req.body as CreateSpeakerInput));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/speakers/:id
adminSpeakersRoutes.patch(
  "/speakers/:id",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  validate(UpdateSpeakerInput),
  async (req, res, next) => {
    try {
      res.json(await updateSpeaker(req.params.id!, req.body as UpdateSpeakerInput));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/speakers/:id
adminSpeakersRoutes.delete(
  "/speakers/:id",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      await deleteSpeaker(req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
