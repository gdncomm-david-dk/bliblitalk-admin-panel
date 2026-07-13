import "dotenv/config";

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.ADMIN_JWT_SECRET ?? "dev-only-change-me",
  cookieName: process.env.COOKIE_NAME ?? "blibli_talk_session",
  logLevel: process.env.LOG_LEVEL ?? "info",
  publicFeOrigin: process.env.PUBLIC_FE_ORIGIN ?? "http://localhost:5173",
  adminFeOrigin: process.env.ADMIN_FE_ORIGIN ?? "http://localhost:5174",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Blibli Talk <noreply@blibli.com>",
  },
};
