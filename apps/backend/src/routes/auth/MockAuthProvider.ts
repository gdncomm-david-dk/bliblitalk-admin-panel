import bcrypt from "bcryptjs";
import { prisma } from "../../db/client";
import type { AuthProvider } from "./AuthProvider";

/** Seeded-user auth for the MVP: verifies bcrypt password hashes for admin/back-office accounts. */
export class MockAuthProvider implements AuthProvider {
  async authenticate(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    // passwordHash is nullable since the 2026-08 email-OTP change: participant accounts
    // created through bliblitalk-user-fe have none. Such an account must never be
    // loginable by password, so treat a missing hash exactly like a missing user.
    if (!user || !user.passwordHash) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  authenticateByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  getUser(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }
}

export const authProvider: AuthProvider = new MockAuthProvider();
