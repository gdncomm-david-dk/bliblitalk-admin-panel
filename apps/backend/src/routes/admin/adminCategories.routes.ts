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
  requirePermission(Permission.EVENT_UPDATE),
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
  requirePermission(Permission.EVENT_UPDATE),
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
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      await deleteCategory(req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
