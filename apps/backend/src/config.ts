import "dotenv/config";

// JWT_SECRET and COOKIE_NAME are gone from this app (Apps Gateway migration, 2026-08-06):
// it signs and verifies nothing, and reads no cookie. bliblitalk-user-fe still needs both
// for its own participant sessions — this only removes them here, not from that app or
// from the shared database.

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),
  logLevel: process.env.LOG_LEVEL ?? "info",
  adminFeOrigin: process.env.ADMIN_FE_ORIGIN ?? "http://localhost:5174",
  // The reminder/lifecycle schedulers must run in exactly one backend process — sweepDueReminders
  // has no idempotency guard, so running it in two processes double-sends every due reminder
  // email. Admin owns them by default; set ENABLE_SCHEDULERS=false there if that ever changes,
  // and never set it to true on the public backend.
  enableSchedulers: process.env.ENABLE_SCHEDULERS !== "false",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Blibli Talk <noreply@blibli.com>",
  },
};
