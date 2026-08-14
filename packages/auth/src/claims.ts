import { Role } from "@repo/shared-types";

/** Shape of the JWT session claims shared by API (sign/verify) and clients (read). */
export interface SessionClaims {
  sub: string;
  email: string;
  role: Role;
  // SEC-007: compared against the user's current tokenVersion column on every request
  // (requireAuth) so a token issued before a logout/role-change stops working immediately.
  tokenVersion: number;
}

/**
 * Narrow an unknown decoded JWT payload to SessionClaims, or null if malformed.
 *
 * bliblitalk-user-fe's review Finding 16 (Informational): `role` and `tokenVersion` used to
 * fall back to `PARTICIPANT` and `0` when they were absent or the wrong type. Substituting a
 * default turns a token that does not carry well-formed claims into a valid-looking session —
 * and `0` in particular is a real `tokenVersion`, so a token missing that claim compared equal
 * to a user who had never logged out and passed the SEC-007 revocation check unchallenged.
 * Fail closed instead: every token this codebase issues sets both fields explicitly, so
 * requiring them rejects nothing legitimate.
 */
export function toSessionClaims(decoded: unknown): SessionClaims | null {
  if (typeof decoded !== "object" || decoded === null) return null;
  const d = decoded as Record<string, unknown>;
  if (typeof d.sub !== "string" || typeof d.email !== "string") return null;
  if (!isRole(d.role)) return null;
  if (typeof d.tokenVersion !== "number" || !Number.isInteger(d.tokenVersion)) return null;
  return { sub: d.sub, email: d.email, role: d.role, tokenVersion: d.tokenVersion };
}

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (Object.values(Role) as string[]).includes(v);
}
