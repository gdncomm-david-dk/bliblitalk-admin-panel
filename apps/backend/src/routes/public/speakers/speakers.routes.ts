import { Router } from "express";
import { toSpeakerDTO } from "../../../lib/shared/mappers";
import { listPublicSpeakers } from "./speakers.service";

export const speakersRoutes = Router();

// GET /speakers — public roster for the landing page (featured first, else all).
speakersRoutes.get("/", async (_req, res, next) => {
  try {
    const speakers = await listPublicSpeakers();
    res.json(speakers.map(toSpeakerDTO));
  } catch (err) {
    next(err);
  }
});
