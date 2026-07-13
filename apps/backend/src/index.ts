import path from "node:path";
import fs from "node:fs";
import express from "express";
import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./logger";
import { completeExpiredEvents } from "./routes/public/events/events.service";
import { sweepDueReminders } from "./routes/admin/adminReminders.service";

const app = createApp();

// Belt-and-suspenders sweep for read paths (admin dashboard/analytics) that query
// events directly instead of going through listEvents/getEventBySlug/etc.
function sweepExpiredEvents() {
  completeExpiredEvents().catch((err) => logger.error({ err }, "Failed to sweep expired events"));
}

function sweepReminders() {
  sweepDueReminders().catch((err) => logger.error({ err }, "Failed to sweep due reminders"));
}

sweepExpiredEvents();
sweepReminders();
setInterval(sweepExpiredEvents, 5 * 60 * 1000);
setInterval(sweepReminders, 60 * 1000);

// In production, serve the built admin FE (single fullstack container).
if (config.isProd) {
  const clientDir = path.resolve(process.cwd(), "../frontend/dist");
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
    logger.info(`Serving admin frontend from ${clientDir}`);
  } else {
    logger.warn(`Admin frontend build not found at ${clientDir}`);
  }
}

app.listen(config.port, () => logger.info(`Blibli Talk Admin API listening on :${config.port}`));
