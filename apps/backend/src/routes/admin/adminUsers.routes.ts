import { Router } from "express";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { listRegistrants } from "./adminUsers.service";

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
    const result = await listRegistrants({ search, page, pageSize });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
