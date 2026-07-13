import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth";
import { getMyEvents } from "./myevents.service";

export const myEventsRoutes = Router();

// GET /me/events
myEventsRoutes.get("/events", requireAuth, async (req, res, next) => {
  try {
    const data = await getMyEvents(req.userId!);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
