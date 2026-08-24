import path from "node:path";
import fs from "node:fs";
import express from "express";
import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./logger";
import { sweepDueReminders } from "./routes/admin/adminReminders.service";
import { sweepEventLifecycle } from "./lib/lifecycle/sweepEventLifecycle";

const app = createApp();

function sweepReminders() {
  sweepDueReminders().catch((err) => logger.error({ err }, "Failed to sweep due reminders"));
}

function sweepLifecycle() {
  sweepEventLifecycle().catch((err) => logger.error({ err }, "Failed to sweep event lifecycle"));
}

if (config.enableSchedulers) {
  sweepReminders();
  sweepLifecycle();
  setInterval(sweepReminders, 60 * 1000);
  setInterval(sweepLifecycle, 60 * 1000);
} else {
  logger.warn("Schedulers disabled (ENABLE_SCHEDULERS=false) — reminders and lifecycle sweeps will not run in this process.");
}

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

app.listen(config.port, "0.0.0.0", () => logger.info(`Blibli Talk Admin API listening on :${config.port}`));
