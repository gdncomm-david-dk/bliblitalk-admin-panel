import { Router, type RequestHandler } from "express";
import { LoginInput, MicrosoftAuthInput } from "@repo/shared-types";
import { isAdminRole } from "@repo/auth";
import { config } from "../../config";
import { AppError } from "../../middleware/error";
import { validate } from "../../middleware/validate";
import { requireAuth } from "../../middleware/requireAuth";
import { authProvider } from "./MockAuthProvider";
import { signToken, toUserDTO, verifyToken } from "../../lib/shared/auth.service";
import { prisma } from "../../db/client";

export const authRoutes = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

// SEC-001: /microsoft is an unauthenticated mock — it issues a real session for any email
// with no password, token, or signature check at all. Real OIDC/OAuth token verification
// replaces this before it ships to a real environment; until then, block it outright once
// NODE_ENV=production so this is only ever reachable in local dev.
const mockProviderGate: RequestHandler = (_req, _res, next) => {
  if (config.isProd) {
    throw new AppError("NOT_FOUND", "This sign-in method is not available.", 404);
  }
  next();
};

// POST /auth/login — Admin CMS only. Repo-split decision 4: this backend owns admin auth;
// participant email login lives in bliblitalk-user-fe's own backend. A participant account
// is treated the same as "not found" rather than "wrong backend" to avoid confirming which
// emails exist.
authRoutes.post("/login", validate(LoginInput), async (req, res, next) => {
  try {
    const { email, password } = req.body as LoginInput;
    const user = await authProvider.authenticate(email, password);
    if (!user || !isAdminRole(user.role)) {
      throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }
    const token = signToken(user);
    res.cookie(config.cookieName, token, cookieOptions);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/microsoft — MOCK Microsoft Entra ID (Azure AD) sign-in for the Admin CMS.
// Production wiring: verify the OAuth/OIDC token server-side and derive { email, name }
// from its claims. There is no self-registration path — admin accounts are provisioned by
// IT/People Ops, so an unknown or non-admin email errors.
authRoutes.post("/microsoft", mockProviderGate, validate(MicrosoftAuthInput), async (req, res, next) => {
  try {
    const { email } = req.body as MicrosoftAuthInput;
    const user = await authProvider.authenticateByEmail(email);
    if (!user || !isAdminRole(user.role)) {
      throw new AppError(
        "NO_ADMIN_ACCOUNT",
        "No Admin CMS account found for this Microsoft account. Contact IT to get access.",
        403,
      );
    }
    const token = signToken(user);
    res.cookie(config.cookieName, token, cookieOptions);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
authRoutes.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await authProvider.getUser(req.userId!);
    if (!user) throw new AppError("UNAUTHORIZED", "Session user not found", 401);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout
// SEC-007: bump tokenVersion so the token being logged out can never be replayed after this
// point (e.g. if it was already leaked or copied elsewhere), not just have its cookie cleared
// in this one browser. Best-effort: a missing/invalid cookie still clears and returns ok.
authRoutes.post("/logout", async (req, res) => {
  const token = req.cookies?.[config.cookieName];
  const payload = token ? verifyToken(token) : null;
  if (payload) {
    await prisma.user.update({
      where: { id: payload.sub },
      data: { tokenVersion: { increment: 1 } },
    });
  }
  res.clearCookie(config.cookieName, { path: "/" });
  res.json({ ok: true });
});
