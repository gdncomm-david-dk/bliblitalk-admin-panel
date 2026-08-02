import type { User } from "@prisma/client";

/**
 * Pluggable authentication strategy. The MVP ships MockAuthProvider (seeded admin/back-office
 * users). A future OidcAuthProvider (Zone 2, real corporate SSO) implements this same
 * interface so routes and UI need no changes. No self-registration path here — admin
 * accounts are provisioned by IT/People Ops (participant self-registration is owned by
 * bliblitalk-user-fe's own backend since the repo split).
 */
export interface AuthProvider {
  /** Password login for admin/back-office accounts. */
  authenticate(email: string, password: string): Promise<User | null>;
  /** Resolve an existing account by email (used by the Microsoft mock). */
  authenticateByEmail(email: string): Promise<User | null>;
  getUser(id: string): Promise<User | null>;
}
