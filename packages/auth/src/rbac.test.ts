import { describe, it, expect } from "vitest";
import { Role } from "@repo/shared-types";
import { can, isAdminRole, isEventScoped, Permission, ADMIN_ROLES } from "./rbac";

describe("rbac", () => {
  it("SUPER_ADMIN holds every permission", () => {
    for (const p of Object.values(Permission)) {
      expect(can(Role.SUPER_ADMIN, p)).toBe(true);
    }
  });

  it("EVENT_ADMIN can manage events, users, and marketing but not global settings", () => {
    expect(can(Role.EVENT_ADMIN, Permission.EVENT_CREATE)).toBe(true);
    expect(can(Role.EVENT_ADMIN, Permission.CERTIFICATE_MANAGE)).toBe(true);
    expect(can(Role.EVENT_ADMIN, Permission.SETTINGS_MANAGE)).toBe(false);
    expect(can(Role.EVENT_ADMIN, Permission.USER_MANAGE)).toBe(true);
    expect(can(Role.EVENT_ADMIN, Permission.MARKETING_MANAGE)).toBe(true);
  });

  it("HR_TA can shortlist and manage speed dating but not create events", () => {
    expect(can(Role.HR_TA, Permission.PARTICIPANT_SHORTLIST)).toBe(true);
    expect(can(Role.HR_TA, Permission.SPEEDDATING_MANAGE)).toBe(true);
    expect(can(Role.HR_TA, Permission.EVENT_CREATE)).toBe(false);
  });

  // SEC-030, owner decision 2026-08-14. Mass mail goes out from noreply@blibli.com to an
  // audience that can be every participant, so the grant is narrower than the rest of the CMS.
  it("only SUPER_ADMIN and EVENT_ADMIN may send marketing campaigns", () => {
    expect(can(Role.SUPER_ADMIN, Permission.MARKETING_MANAGE)).toBe(true);
    expect(can(Role.EVENT_ADMIN, Permission.MARKETING_MANAGE)).toBe(true);
    expect(can(Role.HR_TA, Permission.MARKETING_MANAGE)).toBe(false);
    expect(can(Role.PARTICIPANT, Permission.MARKETING_MANAGE)).toBe(false);
    // Losing marketing must not have cost Talent Acquisition its actual job.
    expect(can(Role.HR_TA, Permission.PARTICIPANT_READ)).toBe(true);
    expect(can(Role.HR_TA, Permission.REGISTRANT_EXPORT)).toBe(true);
  });

  it("only SUPER_ADMIN can manage roles — that is the sole permission no other admin tier holds", () => {
    expect(can(Role.SUPER_ADMIN, Permission.ROLE_MANAGE)).toBe(true);
    expect(can(Role.EVENT_ADMIN, Permission.ROLE_MANAGE)).toBe(false);
    expect(can(Role.HR_TA, Permission.ROLE_MANAGE)).toBe(false);
  });

  // SEC-011. The split is the whole point of the permission: an EVENT_ADMIN still reads its own
  // events' participants on screen, but cannot take a copy of everyone's contact details away.
  it("bulk PII export is limited to SUPER_ADMIN and HR_TA", () => {
    expect(can(Role.SUPER_ADMIN, Permission.REGISTRANT_EXPORT)).toBe(true);
    expect(can(Role.HR_TA, Permission.REGISTRANT_EXPORT)).toBe(true);
    expect(can(Role.EVENT_ADMIN, Permission.REGISTRANT_EXPORT)).toBe(false);
    expect(can(Role.PARTICIPANT, Permission.REGISTRANT_EXPORT)).toBe(false);
    // …while the on-screen read stays where it was, so nobody lost the ability to do their job.
    expect(can(Role.EVENT_ADMIN, Permission.PARTICIPANT_READ)).toBe(true);
    expect(can(Role.EVENT_ADMIN, Permission.USER_MANAGE)).toBe(true);
  });

  it("PARTICIPANT holds no admin permissions and cannot enter admin", () => {
    expect(can(Role.PARTICIPANT, Permission.EVENT_READ)).toBe(false);
    expect(isAdminRole(Role.PARTICIPANT)).toBe(false);
  });

  it("all admin roles (not participant) can enter the admin app", () => {
    expect(ADMIN_ROLES).not.toContain(Role.PARTICIPANT);
    expect(isAdminRole(Role.SUPER_ADMIN)).toBe(true);
    expect(isAdminRole(Role.EVENT_ADMIN)).toBe(true);
    expect(isAdminRole(Role.HR_TA)).toBe(true);
  });

  // The VIEWER tier was retired by owner decision (2026-08-06). Role is a Postgres enum, so
  // the value is gone from the database type too — this asserts nothing reintroduced it as a
  // TypeScript-only value that Prisma would then reject at write time.
  it("exposes exactly four roles — VIEWER was removed, not merely hidden", () => {
    expect(Object.values(Role).sort()).toEqual(
      ["EVENT_ADMIN", "HR_TA", "PARTICIPANT", "SUPER_ADMIN"],
    );
  });

  it("only EVENT_ADMIN is event-scoped", () => {
    expect(isEventScoped(Role.EVENT_ADMIN)).toBe(true);
    expect(isEventScoped(Role.SUPER_ADMIN)).toBe(false);
    expect(isEventScoped(Role.HR_TA)).toBe(false);
  });
});
