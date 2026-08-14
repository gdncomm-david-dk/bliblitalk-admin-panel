import { Router } from "express";
import { CreateCategoryInput, UpdateCategoryInput } from "@repo/shared-types";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "./adminCategories.service";

export const adminCategoriesRoutes = Router();

// Review Finding 15: the category taxonomy is platform-wide, but every route here was gated
// on EVENT_UPDATE — a permission an EVENT_ADMIN holds for their own events. Renaming or
// deleting a category reaches every event in the system, including ones they do not own, so
// the reach did not match the permission's name.
//
// Reads stay on EVENT_UPDATE: an event admin still has to pick a category when editing their
// own event. Writes move to SETTINGS_MANAGE, which is how every other platform-wide
// configuration surface in this app is protected and which today only SUPER_ADMIN holds.

// GET /admin/categories?q=&includeInactive=
adminCategoriesRoutes.get(
  "/categories",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const includeInactive = req.query.includeInactive === "true";
      res.json(await listCategories(q, includeInactive));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/categories
adminCategoriesRoutes.post(
  "/categories",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  validate(CreateCategoryInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await createCategory(req.body as CreateCategoryInput));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/categories/:id
adminCategoriesRoutes.patch(
  "/categories/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  validate(UpdateCategoryInput),
  async (req, res, next) => {
    try {
      res.json(await updateCategory(req.params.id!, req.body as UpdateCategoryInput));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/categories/:id
adminCategoriesRoutes.delete(
  "/categories/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_MANAGE),
  async (req, res, next) => {
    try {
      await deleteCategory(req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
