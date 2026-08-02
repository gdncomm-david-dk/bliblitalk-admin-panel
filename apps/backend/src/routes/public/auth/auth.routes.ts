import { Router, type RequestHandler } from "express";
import { GoogleAuthInput, LoginInput, MicrosoftAuthInput, RegisterInput } from "@repo/shared-types";
import { isAdminRole } from "@repo/auth";
import { config } from "../../../config";
import { AppError } from "../../../middleware/error";
import { validate } from "../../../middleware/validate";
import { requireAuth } from "../../../middleware/requireAuth";
import { authProvider } from "./MockAuthProvider";
import { signToken, toUserDTO, verifyToken } from "../../../lib/shared/auth.service";
import { prisma } from "../../../db/client";

export const authRoutes = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

// SEC-001/SEC-002: /google and /microsoft are unauthenticated mocks — they issue a real
// session for any email with no password, token, or signature check at all. Real OIDC/OAuth
// token verification replaces this before either provider ships to a real environment; until
// then, block both routes outright once NODE_ENV=production so this is only ever reachable
// in local dev.
const mockProviderGate: RequestHandler = (_req, _res, next) => {
  if (config.isProd) {
    throw new AppError("NOT_FOUND", "This sign-in method is not available.", 404);
  }
  next();
};

// POST /auth/login
authRoutes.post("/login", validate(LoginInput), async (req, res, next) => {
  try {
    const { email, password } = req.body as LoginInput;
    const user = await authProvider.authenticate(email, password);
    if (!user) throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    const token = signToken(user);
    res.cookie(config.cookieName, token, cookieOptions);
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/google — MOCK Google sign-in.
// Production wiring: replace the request body with a verified OAuth ID token and
// derive { email, name } from its claims. For a known account we issue a session;
// for a new one we return the Google profile so the client can complete registration
// (no password, email pre-filled + hidden).
authRoutes.post("/google", mockProviderGate, validate(GoogleAuthInput), async (req, res, next) => {
  try {
    const { email, name } = req.body as GoogleAuthInput;
    const user = await authProvider.authenticateByEmail(email);
    if (!user) {
      res.json({ registered: false, profile: { email, name } });
      return;
    }
    const token = signToken(user);
    res.cookie(config.cookieName, token, cookieOptions);
    res.json({ registered: true, user: toUserDTO(user) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/microsoft — MOCK Microsoft Entra ID (Azure AD) sign-in for the Admin CMS.
// Production wiring: verify the OAuth/OIDC token server-side and derive { email, name }
// from its claims. Unlike /auth/google, there is no self-registration path — admin
// accounts are provisioned by IT/People Ops, so an unknown or non-admin email errors.
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

// POST /auth/register — create a participant account and sign in.
authRoutes.post("/register", validate(RegisterInput), async (req, res, next) => {
  try {
    const input = req.body as RegisterInput;
    // SEC-024: a non-"email" provider (currently only "google") is an unauthenticated
    // identity assertion with no password/token/signature check — the same bypass class as
    // SEC-001/SEC-002, just reached via /auth/register instead of /auth/google. Block it in
    // production the same way mockProviderGate blocks /auth/google and /auth/microsoft, while
    // leaving the normal provider === "email" registration path completely untouched.
    if (input.provider !== "email" && config.isProd) {
      throw new AppError("NOT_FOUND", "This sign-in method is not available.", 404);
    }
    // Email registrations must set a password; Google registrations are federated.
    if (input.provider !== "google" && !input.password) {
      throw new AppError("PASSWORD_REQUIRED", "Password is required", 422);
    }
    const existing = await authProvider.authenticateByEmail(input.email);
    if (existing) {
      throw new AppError("EMAIL_TAKEN", "An account with this email already exists", 409);
    }
    const user = await authProvider.register({
      name: input.fullName,
      email: input.email,
      password: input.provider === "google" ? null : input.password,
      phone: input.phone,
      institution: input.institution ?? null,
      position: input.role ?? null,
      yearsOfExperience: input.yearsOfExperience ?? null,
    });
    const token = signToken(user);
    res.cookie(config.cookieName, token, cookieOptions);
    res.status(201).json({ user: toUserDTO(user) });
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
