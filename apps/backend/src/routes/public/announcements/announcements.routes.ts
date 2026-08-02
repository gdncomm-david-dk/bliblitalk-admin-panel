import { Router } from "express";
import { prisma } from "../../../db/client";
import { toAnnouncementDTO } from "../shared/mappers";

export const announcementsRoutes = Router();

// GET /announcements
announcementsRoutes.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.announcement.findMany({
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    });
    res.json(rows.map(toAnnouncementDTO));
  } catch (err) {
    next(err);
  }
});
