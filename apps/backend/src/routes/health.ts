import { Router } from "express";

/**
 * Apps Gateway probe paths. The gateway routes /health, /api/health, /version and
 * /api/version straight to the service on an EXACT match, bypassing authentication — so
 * these must answer without a session and must never read identity (no X-User-Id is
 * forwarded on them). That is the platform's routing contract, not a hole in ours:
 * readiness/liveness probes and ops tooling depend on it.
 *
 * Mounted under /api, so these serve /api/health and /api/version. If this app ever needs
 * different probe paths, declare them in .platform/observability.yaml rather than inventing
 * another public prefix.
 */
export const healthRoutes = Router();

healthRoutes.get("/health", (_req, res) => res.json({ status: "ok" }));

healthRoutes.get("/version", (_req, res) =>
  res.json({ name: "bliblitalk-admin", version: process.env.APP_VERSION ?? "dev" }),
);
