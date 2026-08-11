import { describe, it, expect } from "vitest";
import type { User } from "@prisma/client";
import { toUserDTO } from "./auth.service";

// The SEC-020 test that lived here (rejecting a JWT signed with an algorithm other than
// HS256) went with signToken/verifyToken in the Apps Gateway migration — this app no longer
// verifies tokens at all. The same guard and the same regression test still exist in
// bliblitalk-user-fe, which does still issue participant sessions.

const row: User = {
  id: "user-1",
  email: "staff@gdn-commerce.com",
  name: "Staff Member",
  role: "SUPER_ADMIN",
  employmentType: "INTERNAL",
  department: "People",
  position: "Manager",
  phone: "+62 811 0000 0000",
  avatarUrl: null,
  institution: null,
  yearsOfExperience: null,
  passwordHash: "$2a$10$notarealhashatall",
  tokenVersion: 3,
  createdAt: new Date(),
};

describe("toUserDTO", () => {
  it("carries the fields the CMS renders", () => {
    expect(toUserDTO(row)).toMatchObject({
      id: "user-1",
      email: "staff@gdn-commerce.com",
      name: "Staff Member",
      role: "SUPER_ADMIN",
      department: "People",
      position: "Manager",
    });
  });

  it("never leaks the credential or session columns", () => {
    // This mapper is the boundary between the User row and the wire. passwordHash is a
    // legacy column no longer written by this app, and tokenVersion belongs to
    // bliblitalk-user-fe's sessions — neither has any business reaching a browser.
    const dto = toUserDTO(row) as Record<string, unknown>;
    expect(dto).not.toHaveProperty("passwordHash");
    expect(dto).not.toHaveProperty("tokenVersion");
    expect(JSON.stringify(dto)).not.toContain("notarealhash");
  });
});
