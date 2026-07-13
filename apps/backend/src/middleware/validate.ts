import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "./error";

type Source = "body" | "query" | "params";

/** Validates the given request source against a Zod schema, replacing it with the parsed data. */
export const validate =
  (schema: ZodTypeAny, source: Source = "body"): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError("VALIDATION", "Invalid request", 422, result.error.flatten()));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[source] = result.data;
    next();
  };
