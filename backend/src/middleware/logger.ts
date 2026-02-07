import pino from "pino";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app.js";
import { env } from "../env.js";

export const log = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
  redact: ["req.headers.cookie", "req.headers.authorization"],
});

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  log.info({
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  });
});
