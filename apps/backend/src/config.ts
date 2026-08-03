import "dotenv/config";

const PLACEHOLDER_JWT_SECRETS = new Set(["dev-only-change-me", "changeme", "secret", ""]);
const MIN_PROD_JWT_SECRET_LENGTH = 32;

/**
 * In production, a missing/placeholder/short secret would let anyone forge a session JWT —
 * fail fast at startup instead of silently signing tokens with a guessable value. Outside
 * production, keep the dev fallback so `pnpm dev` works with no env setup required.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.ADMIN_JWT_SECRET;
  if (env.NODE_ENV === "production") {
    if (!secret || secret.length < MIN_PROD_JWT_SECRET_LENGTH || PLACEHOLDER_JWT_SECRETS.has(secret)) {
      throw new Error(
        `ADMIN_JWT_SECRET must be set to a random value of at least ${MIN_PROD_JWT_SECRET_LENGTH} ` +
          "characters in production.",
      );
    }
    return secret;
  }
  return secret && secret.length > 0 ? secret : "dev-only-change-me";
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: resolveJwtSecret(process.env),
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
