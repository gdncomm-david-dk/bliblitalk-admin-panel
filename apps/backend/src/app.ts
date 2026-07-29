import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./logger";
import { config } from "./config";
import { errorHandler } from "./middleware/error";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/public/auth/auth.routes";
import { eventsRoutes } from "./routes/public/events/events.routes";
import { dashboardRoutes } from "./routes/public/dashboard/dashboard.routes";
import { myEventsRoutes } from "./routes/public/myevents/myevents.routes";
import { registrationsRoutes } from "./routes/public/registrations/registrations.routes";
import { speakersRoutes } from "./routes/public/speakers/speakers.routes";
import { announcementsRoutes } from "./routes/public/announcements/announcements.routes";
import { settingsRoutes } from "./routes/public/settings/settings.routes";
import { adminDashboardRoutes } from "./routes/admin/adminDashboard.routes";
import { adminEventsRoutes } from "./routes/admin/adminEvents.routes";
import { adminParticipantsRoutes } from "./routes/admin/adminParticipants.routes";
import { adminCertificatesRoutes } from "./routes/admin/adminCertificates.routes";
import { adminAnalyticsRoutes } from "./routes/admin/adminAnalytics.routes";
import { adminFeedbackRoutes } from "./routes/admin/adminFeedback.routes";
import { adminSpeedDatingRoutes } from "./routes/admin/adminSpeedDating.routes";
import { adminUploadsRoutes, UPLOADS_DIR } from "./routes/admin/adminUploads.routes";
import { adminModuleSettingsRoutes } from "./routes/admin/adminModuleSettings.routes";
import { adminSiteSettingsRoutes } from "./routes/admin/adminSiteSettings.routes";
import { adminUsersRoutes } from "./routes/admin/adminUsers.routes";
import { adminMarketingRoutes } from "./routes/admin/adminMarketing.routes";
import { adminRemindersRoutes } from "./routes/admin/adminReminders.routes";
import { adminSpeakersRoutes } from "./routes/admin/adminSpeakers.routes";
import { adminCategoriesRoutes } from "./routes/admin/adminCategories.routes";
import { createAuthRateLimiter } from "./middleware/rateLimit";

// Every request carries the session cookie in `req.headers.cookie` — redact it (and any
// Authorization header) so pino-http's default request serializer never writes a live
// session token into application logs. SEC-006: a login/register response's own
// `Set-Cookie` header carries the brand-new session JWT and must be redacted too, or the
// token leaks into logs the instant it's issued instead of only on later requests.
export const LOG_REDACT_PATHS = ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'];

export function createRequestLogger(loggerInstance: typeof logger = logger) {
  return pinoHttp({ logger: loggerInstance, redact: LOG_REDACT_PATHS });
}

export function createApp() {
  const app = express();

  // SEC-005 follow-up: the documented deployment topology (k8s/README.md) puts this app
  // behind exactly one reverse proxy (Ingress -> internal Load Balancer). Without this,
  // express-rate-limit's default req.ip-based bucketing resolves to the proxy's own address
  // for every request, collapsing the per-client limit into one bucket shared by every user
  // behind it. `1` trusts exactly the nearest hop, matching that single-proxy topology --
  // revisit this number if the real topology ever adds another hop in front of the app.
  app.set("trust proxy", 1);

  app.use(createRequestLogger());
  app.use(express.json());
  app.use(cookieParser());

  // CORS is per-prefix, not wildcard: /api/public/* only trusts the user-facing
  // portal's origin, /api/admin/* only trusts the admin CMS's origin. Auth is the
  // one surface both FE apps hit directly (single unified session/RBAC system),
  // so it gets its own prefix trusting both known origins — never a wildcard.
  app.use(
    "/api/auth",
    cors({ origin: [config.publicFeOrigin, config.adminFeOrigin], credentials: true }),
  );
  app.use(
    "/api/public",
    cors({ origin: config.publicFeOrigin, credentials: true }),
  );
  app.use(
    "/api/admin",
    cors({ origin: config.adminFeOrigin, credentials: true }),
  );

  app.use("/api", healthRoutes);

  // Uploaded images (served statically; written by POST /api/admin/uploads).
  // Not gated by either CORS block above — referenced as <img src> by both FE apps.
  app.use("/api/uploads", express.static(UPLOADS_DIR));

  app.use("/api/auth", createAuthRateLimiter(), authRoutes);
  app.use("/api/public/events", eventsRoutes);
  app.use("/api/public/speakers", speakersRoutes);
  app.use("/api/public/me", dashboardRoutes);
  app.use("/api/public/me", myEventsRoutes);
  app.use("/api/public/me", registrationsRoutes);
  app.use("/api/public/announcements", announcementsRoutes);
  app.use("/api/public/site-settings", settingsRoutes);

  app.use("/api/admin", adminDashboardRoutes);
  app.use("/api/admin/events", adminEventsRoutes);
  app.use("/api/admin", adminParticipantsRoutes);
  app.use("/api/admin", adminCertificatesRoutes);
  app.use("/api/admin", adminAnalyticsRoutes);
  app.use("/api/admin", adminFeedbackRoutes);
  app.use("/api/admin", adminSpeedDatingRoutes);
  app.use("/api/admin", adminUploadsRoutes);
  app.use("/api/admin", adminModuleSettingsRoutes);
  app.use("/api/admin", adminSiteSettingsRoutes);
  app.use("/api/admin", adminUsersRoutes);
  app.use("/api/admin", adminMarketingRoutes);
  app.use("/api/admin", adminRemindersRoutes);
  app.use("/api/admin", adminSpeakersRoutes);
  app.use("/api/admin", adminCategoriesRoutes);

  app.use(errorHandler);
  return app;
}
