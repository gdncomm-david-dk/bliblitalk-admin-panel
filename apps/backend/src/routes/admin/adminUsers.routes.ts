import { Router } from "express";
import { Permission } from "@repo/auth";
import { CreateAdminUserInput, UpdateUserEmploymentTypeInput, UpdateUserRoleInput } from "@repo/shared-types";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import {
  createAdminUser,
  exportRegistrants,
  listRegistrants,
  registrantCsv,
  updateUserEmploymentType,
  updateUserRole,
} from "./adminUsers.service";
import { AuditAction, recordAudit } from "../../lib/shared/auditLog";

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

// GET /admin/users/export?search= — SEC-011: bulk PII export, gated and audited.
//
// Registered before POST /users but after GET /users; Express matches in order and "/users/export"
// cannot collide with either, so placement here is for readability, not routing.
adminUsersRoutes.get(
  "/users/export",
  requireAuth,
  requirePermission(Permission.REGISTRANT_EXPORT),
  async (req, res, next) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const { items, truncated } = await exportRegistrants(search, req.userId!, req.userRole!);

      // Recorded before the response is written: if the client disconnects mid-download the
      // rows were still read out of the database, and the trail should say so.
      await recordAudit({
        action: AuditAction.REGISTRANT_EXPORT,
        actorId: req.userId!,
        actorEmail: req.userEmail!,
        actorRole: req.userRole!,
        rowCount: items.length,
        detail: [search ? `search=${search}` : "no filter", truncated ? "TRUNCATED at cap" : null]
          .filter(Boolean)
          .join("; "),
      });

      const filename = `registrants-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(registrantCsv(items));
    } catch (err) {
      next(err);
    }
  },
);

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
