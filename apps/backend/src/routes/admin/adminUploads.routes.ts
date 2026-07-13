import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { AppError } from "../../middleware/error";

// Local disk storage for dev/prototype. Served statically at /uploads (see app.ts).
export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${EXT[file.mimetype] ?? ""}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new AppError("UNSUPPORTED_MEDIA_TYPE", "Only PNG, JPG, WEBP, or GIF images are allowed.", 415));
  },
});

export const adminUploadsRoutes = Router();

// POST /admin/uploads — multipart form-data, field "file". Returns { url }.
adminUploadsRoutes.post(
  "/uploads",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) return next(err);
      if (!req.file) return next(new AppError("BAD_REQUEST", "No file uploaded.", 400));
      // Prefixed with /api so it flows through the same proxy/route as other API calls.
      res.status(201).json({ url: `/api/uploads/${req.file.filename}` });
    });
  },
);
