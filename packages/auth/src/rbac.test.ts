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

  it("VIEWER is read-only", () => {
    expect(can(Role.VIEWER, Permission.EVENT_READ)).toBe(true);
    expect(can(Role.VIEWER, Permission.ANALYTICS_READ)).toBe(true);
    expect(can(Role.VIEWER, Permission.EVENT_UPDATE)).toBe(false);
  });

  it("PARTICIPANT holds no admin permissions and cannot enter admin", () => {
    expect(can(Role.PARTICIPANT, Permission.EVENT_READ)).toBe(false);
    expect(isAdminRole(Role.PARTICIPANT)).toBe(false);
  });

  it("all admin roles (not participant) can enter the admin app", () => {
    expect(ADMIN_ROLES).not.toContain(Role.PARTICIPANT);
    expect(isAdminRole(Role.SUPER_ADMIN)).toBe(true);
    expect(isAdminRole(Role.VIEWER)).toBe(true);
  });

  it("only EVENT_ADMIN is event-scoped", () => {
    expect(isEventScoped(Role.EVENT_ADMIN)).toBe(true);
    expect(isEventScoped(Role.SUPER_ADMIN)).toBe(false);
    expect(isEventScoped(Role.HR_TA)).toBe(false);
  });
});
