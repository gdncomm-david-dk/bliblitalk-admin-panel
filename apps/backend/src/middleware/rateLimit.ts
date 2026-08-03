import rateLimit from "express-rate-limit";

/**
 * SEC-005: /api/auth/* had no request-rate ceiling at all — unlimited brute force against
 * bcrypt password hashes, and unlimited email enumeration via /google's registered/
 * unregistered oracle and /register's EMAIL_TAKEN response. 50 requests per 15 minutes per
 * client is still glacially slow for guessing a bcrypt-hashed password, but generous enough
 * that it never fires during normal use (or a growing integration-test suite that shares one
 * app instance across many auth-flow cases).
 *
 * A factory (not a shared singleton) so every createApp() call gets its own in-memory store —
 * each test file constructs one app and reuses it across its own `it()` cases, so this only
 * ever counts requests that belong to the same running server / same test file, never bleeding
 * state across unrelated tests or processes.
 */
export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please try again later." },
  });
}
