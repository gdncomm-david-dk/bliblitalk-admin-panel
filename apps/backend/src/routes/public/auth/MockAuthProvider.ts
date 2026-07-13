import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../../db/client";
import type { AuthProvider, RegisterData } from "./AuthProvider";

/**
 * Seeded-user auth for the MVP: verifies bcrypt password hashes (admin/back-office),
 * and resolves participant accounts passwordlessly by email. Self-registered accounts
 * get an unusable random hash so they can only sign in via the passwordless path.
 */
export class MockAuthProvider implements AuthProvider {
  async authenticate(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  authenticateByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async register(data: RegisterData) {
    // Email registrations hash the chosen password; federated (Google) accounts get
    // an unguessable random hash so password login is impossible for them.
    const passwordHash = await bcrypt.hash(data.password || randomUUID(), 10);
    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        institution: data.institution ?? null,
        position: data.position ?? null,
        yearsOfExperience: data.yearsOfExperience ?? null,
        role: "PARTICIPANT",
        passwordHash,
      },
    });
  }

  getUser(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }
}

export const authProvider: AuthProvider = new MockAuthProvider();
