import rateLimit from "express-rate-limit";

/**
 * SEC-005 originally put a 50-per-15-minutes ceiling on `/api/auth/*` to stop brute force
 * against bcrypt password hashes and email enumeration. Apps Gateway now owns login, and
 * those endpoints no longer exist here — but the control is repointed rather than dropped,
 * because a rate ceiling on the admin API is still worth having: it bounds how fast a
 * compromised or careless staff session can scrape the registrant database or drive the
 * bulk-email endpoints.
 *
 * 600 per 15 minutes per client is deliberately generous — the CMS is call-heavy (a single
 * workspace page fans out to several endpoints) and this must never fire during real use.
 * It is a blast-radius limit, not an authentication control; the authentication control is
 * the gateway's WHITELIST access mode.
 *
 * A factory (not a shared singleton) so every createApp() call gets its own in-memory store —
 * each test file constructs one app and reuses it across its own `it()` cases, so this only
 * ever counts requests that belong to the same running server / same test file, never bleeding
 * state across unrelated tests or processes.
 */
export function createAdminApiRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "TOO_MANY_REQUESTS", message: "Too many requests. Please try again later." },
  });
}
