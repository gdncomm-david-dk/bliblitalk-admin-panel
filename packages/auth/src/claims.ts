import { Role } from "@repo/shared-types";

/** Shape of the JWT session claims shared by API (sign/verify) and clients (read). */
export interface SessionClaims {
  sub: string;
  email: string;
  role: Role;
}

/** Narrow an unknown decoded JWT payload to SessionClaims, or null if malformed. */
export function toSessionClaims(decoded: unknown): SessionClaims | null {
  if (typeof decoded !== "object" || decoded === null) return null;
  const d = decoded as Record<string, unknown>;
  if (typeof d.sub !== "string" || typeof d.email !== "string") return null;
  const role = isRole(d.role) ? d.role : Role.PARTICIPANT;
  return { sub: d.sub, email: d.email, role };
}

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (Object.values(Role) as string[]).includes(v);
}
