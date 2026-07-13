import type { User } from "@prisma/client";

/** Fields collected by the participant self-registration form. */
export interface RegisterData {
  name: string;
  email: string;
  /** Present for email registrations; omitted for federated (Google) accounts. */
  password?: string | null;
  phone: string;
  institution?: string | null;
  position?: string | null;
  yearsOfExperience?: string | null;
}

/**
 * Pluggable authentication strategy. The MVP ships MockAuthProvider (seeded users +
 * passwordless email sign-in). A future OidcAuthProvider (Zone 2, real corporate SSO)
 * implements this same interface so routes and UI need no changes.
 */
export interface AuthProvider {
  /** Password login (retained for admin/back-office accounts). */
  authenticate(email: string, password: string): Promise<User | null>;
  /** Passwordless sign-in: resolve an existing account by email. */
  authenticateByEmail(email: string): Promise<User | null>;
  /** Create a new participant account (passwordless). */
  register(data: RegisterData): Promise<User>;
  getUser(id: string): Promise<User | null>;
}
