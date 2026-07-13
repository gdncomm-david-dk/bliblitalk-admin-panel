import { Router } from "express";
import { Permission } from "@repo/auth";
import {
  AddMarketingContactInput,
  AddMarketingContactsBulkInput,
  CreateCampaignInput,
} from "@repo/shared-types";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import {
  addContact,
  addContactsBulk,
  createAndSendCampaign,
  listCampaigns,
  listContacts,
  removeContact,
  syncContactsFromRegistrants,
} from "./adminMarketing.service";

export const adminMarketingRoutes = Router();

// GET /admin/marketing/contacts
adminMarketingRoutes.get(
  "/marketing/contacts",
  requireAuth,
  requirePermission(Permission.MARKETING_MANAGE),
  async (req, res, next) => {
    try {
      const { search, page, pageSize } = req.query;
      res.json(
        await listContacts({
          search: typeof search === "string" ? search : undefined,
          page: page !== undefined ? Number(page) : undefined,
          pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/marketing/contacts
adminMarketingRoutes.post(
  "/marketing/contacts",
  requireAuth,
  requirePermission(Permission.MARKETING_MANAGE),
  validate(AddMarketingContactInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await addContact(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/marketing/contacts/bulk
adminMarketingRoutes.post(
  "/marketing/contacts/bulk",
  requireAuth,
  requirePermission(Permission.MARKETING_MANAGE),
  validate(AddMarketingContactsBulkInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await addContactsBulk(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/marketing/contacts/sync-registrants
adminMarketingRoutes.post(
  "/marketing/contacts/sync-registrants",
  requireAuth,
  requirePermission(Permission.MARKETING_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await syncContactsFromRegistrants());
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/marketing/contacts/:id
adminMarketingRoutes.delete(
  "/marketing/contacts/:id",
  requireAuth,
  requirePermission(Permission.MARKETING_MANAGE),
  async (req, res, next) => {
    try {
      await removeContact(req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/marketing/campaigns
adminMarketingRoutes.get(
  "/marketing/campaigns",
  requireAuth,
  requirePermission(Permission.MARKETING_MANAGE),
  async (_req, res, next) => {
    try {
      res.json(await listCampaigns());
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/marketing/campaigns
adminMarketingRoutes.post(
  "/marketing/campaigns",
  requireAuth,
  requirePermission(Permission.MARKETING_MANAGE),
  validate(CreateCampaignInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await createAndSendCampaign(req.body));
    } catch (err) {
      next(err);
    }
  },
);
