import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import type { UserDTO } from "@repo/shared-types";
import { type SessionClaims, toSessionClaims } from "@repo/auth";
import { config } from "../../config";

export type TokenPayload = SessionClaims;

export function signToken(user: Pick<User, "id" | "email" | "role" | "tokenVersion">): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion } satisfies TokenPayload,
    config.jwtSecret,
    { expiresIn: "7d", algorithm: "HS256" },
  );
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    return toSessionClaims(decoded);
  } catch {
    return null;
  }
}

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
    position: user.position,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    institution: user.institution,
    yearsOfExperience: user.yearsOfExperience,
  };
}
