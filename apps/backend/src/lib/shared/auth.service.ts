import type { User } from "@prisma/client";
import type { UserDTO } from "@repo/shared-types";

/**
 * All this file does now is shape a User row for the wire.
 *
 * signToken/verifyToken were removed in the Apps Gateway migration (2026-08-06): this app
 * issues no session and verifies no token — the gateway authenticates at the edge and hands
 * over the user's email in X-User-Id. bliblitalk-user-fe keeps its own copy of the JWT
 * helpers for participant sessions; that app is not behind the gateway.
 */
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
