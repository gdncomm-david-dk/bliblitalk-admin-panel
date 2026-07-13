import { Router } from "express";
import { EventListQuery, RegisterEventInput } from "@repo/shared-types";
import { AppError } from "../../../middleware/error";
import { requireAuth } from "../../../middleware/requireAuth";
import { validate } from "../../../middleware/validate";
import { toEventDTO } from "../../../lib/shared/mappers";
import { getEventBySlug, listEvents, registerForEvent } from "./events.service";

export const eventsRoutes = Router();

// GET /events?status=upcoming
eventsRoutes.get("/", validate(EventListQuery, "query"), async (req, res, next) => {
  try {
    const { status } = req.query as EventListQuery;
    const events = await listEvents(status);
    res.json(events.map(toEventDTO));
  } catch (err) {
    next(err);
  }
});

// GET /events/:slug — portal never exposes DRAFT/CANCELLED events.
const PORTAL_HIDDEN: string[] = ["DRAFT", "CANCELLED"];
eventsRoutes.get("/:slug", async (req, res, next) => {
  try {
    const event = await getEventBySlug(req.params.slug);
    if (!event || PORTAL_HIDDEN.includes(event.status)) {
      throw new AppError("NOT_FOUND", "Event not found", 404);
    }
    res.json(toEventDTO(event));
  } catch (err) {
    next(err);
  }
});

// POST /events/:slug/register
eventsRoutes.post(
  "/:slug/register",
  requireAuth,
  validate(RegisterEventInput),
  async (req, res, next) => {
    try {
      const { joinSpeedDating } = req.body as RegisterEventInput;
      const myEvent = await registerForEvent(req.userId!, req.params.slug!, joinSpeedDating);
      res.status(201).json(myEvent);
    } catch (err) {
      next(err);
    }
  },
);
