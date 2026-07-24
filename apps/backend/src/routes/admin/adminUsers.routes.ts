import { Router } from "express";
import { Permission } from "@repo/auth";
import { CreateAdminUserInput, UpdateUserEmploymentTypeInput, UpdateUserRoleInput } from "@repo/shared-types";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import { createAdminUser, listRegistrants, updateUserEmploymentType, updateUserRole } from "./adminUsers.service";

export const adminUsersRoutes = Router();

function parsePositiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// GET /admin/users?search=&page=&pageSize=
adminUsersRoutes.get("/users", requireAuth, requirePermission(Permission.USER_MANAGE), async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const page = parsePositiveInt(req.query.page);
    const pageSize = parsePositiveInt(req.query.pageSize);
    const result = await listRegistrants({ search, page, pageSize }, req.userId!, req.userRole!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /admin/users — SUPER_ADMIN only, provisions a new Admin CMS staff account.
adminUsersRoutes.post(
  "/users",
  requireAuth,
  requirePermission(Permission.ROLE_MANAGE),
  validate(CreateAdminUserInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await createAdminUser(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/users/:id/role — SUPER_ADMIN only, sets a user's admin role.
adminUsersRoutes.patch(
  "/users/:id/role",
  requireAuth,
  requirePermission(Permission.ROLE_MANAGE),
  validate(UpdateUserRoleInput),
  async (req, res, next) => {
    try {
      res.json(await updateUserRole(req.params.id!, req.body.role));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/users/:id/employment-type — Internal (employee) vs External classification.
adminUsersRoutes.patch(
  "/users/:id/employment-type",
  requireAuth,
  requirePermission(Permission.USER_MANAGE),
  validate(UpdateUserEmploymentTypeInput),
  async (req, res, next) => {
    try {
      res.json(await updateUserEmploymentType(req.params.id!, req.body.employmentType));
    } catch (err) {
      next(err);
    }
  },
);
