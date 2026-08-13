import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./logger";
import { config } from "./config";
import { errorHandler } from "./middleware/error";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me.routes";
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
import { createAdminApiRateLimiter } from "./middleware/rateLimit";
import { createSecurityHeaders, uploadsNoSniff } from "./middleware/securityHeaders";

// SEC-006: this app no longer issues any session of its own (Apps Gateway owns login), but
// the gateway's own auth cookie still rides along on every request in `req.headers.cookie`,
// so the redaction stays. `authorization` and `set-cookie` are kept for the same reason —
// cheap, and they close the hole again the moment anything reintroduces a bearer token.
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

  // SEC-032: first, so every response carries them — including 404s, the error handler's
  // output, and the static files below, none of which pass through the routers.
  app.disable("x-powered-by");
  app.use(createSecurityHeaders());

  app.use(createRequestLogger());
  app.use(express.json());
  // No cookie-parser: this app reads no cookies at all now. The gateway's auth cookie is
  // its own business and is never inspected here — identity arrives as the X-User-Id header.

  // Repo split: this backend is internal-only and serves nothing on /api/public/* anymore
  // (bliblitalk-user-fe owns that now, with its own backend). CORS only ever needs to trust
  // the admin CMS's own origin. This matters for local dev, where the SPA (5184) and this
  // API (4001) are separate origins; in production both sit on one gateway subdomain, so
  // requests are same-origin and none of this applies. `credentials` is gone with the
  // cookie — the SPA sends no cookie to this API any more.
  app.use("/api/me", cors({ origin: config.adminFeOrigin }));
  app.use("/api/admin", cors({ origin: config.adminFeOrigin }));

  // Gateway probe paths (/api/health, /api/version) — unauthenticated by gateway design,
  // exact match, and mounted before everything else so nothing can accidentally gate them.
  app.use("/api", healthRoutes);

  // Uploaded images (served statically; written by POST /api/admin/uploads). Referenced as
  // <img src> by the portal too, so it stays unauthenticated static file serving.
  // KNOWN BLOCKER for the gateway rollout: behind Apps Gateway every non-probe path is
  // login-required, so anonymous portal visitors would be redirected to the login UI and
  // these images would break. Phase 6 (uploads -> GCS) is the fix; widening the public
  // prefix to paper over it is not. See PROJECT.md "Login Method".
  app.use("/api/uploads", uploadsNoSniff, express.static(UPLOADS_DIR));

  app.use("/api", meRoutes);

  app.use("/api/admin", createAdminApiRateLimiter());
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
