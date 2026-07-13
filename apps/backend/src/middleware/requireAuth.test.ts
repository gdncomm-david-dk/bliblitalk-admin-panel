import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { Role } from "@repo/shared-types";
import { requireRole } from "./requireAuth";
import { AppError } from "./error";

function run(role: Role | undefined, allowed: Role[]) {
  const req = { userRole: role } as Request;
  const res = {} as Response;
  const next = vi.fn();
  requireRole(allowed)(req, res, next);
  return next.mock.calls[0]?.[0] as AppError | undefined;
}

describe("requireRole", () => {
  it("passes through when the role is allowed", () => {
    const err = run(Role.SUPER_ADMIN, [Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    expect(err).toBeUndefined();
  });

  it("401s when unauthenticated (no role on the request)", () => {
    const err = run(undefined, [Role.SUPER_ADMIN]);
    expect(err).toBeInstanceOf(AppError);
    expect(err?.status).toBe(401);
  });

  it("403s when the role is not permitted", () => {
    const err = run(Role.PARTICIPANT, [Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    expect(err).toBeInstanceOf(AppError);
    expect(err?.status).toBe(403);
    expect(err?.code).toBe("FORBIDDEN");
  });
});
