import type { ErrorRequestHandler } from "express";
import { logger } from "../logger";

/** Application error carrying an HTTP status, a stable code, and optional details. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // Multer surfaces upload problems (e.g. file too large) with name "MulterError".
  if (err && typeof err === "object" && (err as { name?: string }).name === "MulterError") {
    const code = (err as { code?: string }).code;
    const message =
      code === "LIMIT_FILE_SIZE" ? "File is too large (max 5 MB)." : "File upload failed.";
    return res.status(400).json({ error: { code: code ?? "UPLOAD_ERROR", message } });
  }
  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
};
