import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { AppError } from "../../middleware/error";
import { sniffImageType } from "../../lib/shared/imageType";

// Local disk storage for dev/prototype. Served statically at /uploads (see app.ts).
export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const UNSUPPORTED = "Only PNG, JPG, WEBP, or GIF images are allowed.";

// SEC-017: buffer the upload rather than streaming it to disk, so the bytes can be checked
// before anything is written. At a 5 MB cap this costs one short-lived buffer per request,
// and it means a rejected file never exists on disk at all.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
});

export const adminUploadsRoutes = Router();

// POST /admin/uploads — multipart form-data, field "file". Returns { url }.
adminUploadsRoutes.post(
  "/uploads",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  (req, res, next) => {
    upload.single("file")(req, res, async (err: unknown) => {
      if (err) return next(err);
      if (!req.file) return next(new AppError("BAD_REQUEST", "No file uploaded.", 400));

      const kind = sniffImageType(req.file.buffer);
      if (!kind) return next(new AppError("UNSUPPORTED_MEDIA_TYPE", UNSUPPORTED, 415));

      try {
        // SEC-017: `Date.now()` plus `Math.random()` was guessable enough to enumerate the
        // whole directory, which matters because app.ts serves it unauthenticated. The
        // extension comes from the sniffed type, never from the client's filename, so the
        // uploader controls neither the name nor the path.
        const filename = `${randomBytes(16).toString("hex")}.${kind.ext}`;
        await writeFile(path.join(UPLOADS_DIR, filename), req.file.buffer);
        // Prefixed with /api so it flows through the same proxy/route as other API calls.
        res.status(201).json({ url: `/api/uploads/${filename}` });
      } catch (writeErr) {
        next(writeErr);
      }
    });
  },
);
