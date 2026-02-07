import type { ErrorHandler } from "hono";
import { AppError } from "../lib/errors.js";
import { ZodError } from "zod";
import { log } from "./logger.js";
import type { AppEnv } from "../app.js";

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get("requestId");

  // Known application errors
  if (err instanceof AppError) {
    return c.json(
      { error: err.message, code: err.code, requestId },
      err.statusCode as 400,
    );
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return c.json(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        detail: err.flatten().fieldErrors,
        requestId,
      },
      422,
    );
  }

  // Unknown errors — log full detail, return generic message
  log.error({ requestId, err: err.message, stack: err.stack }, "Unhandled error");
  return c.json(
    { error: "Internal server error", code: "INTERNAL_ERROR", requestId },
    500,
  );
};
