import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../app.js";

type RateLimitConfig = {
  windowMs: number;
  max: number;
  keyFn: (c: any) => string;
  message?: string;
};

const stores = new Map<string, Map<string, { count: number; resetAt: number }>>();

export function rateLimit(name: string, config: RateLimitConfig) {
  if (!stores.has(name)) stores.set(name, new Map());
  const store = stores.get(name)!;

  return createMiddleware<AppEnv>(async (c, next) => {
    const key = config.keyFn(c);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + config.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(config.max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, config.max - entry.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > config.max) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        config.message ?? "Too many requests. Please try again later.",
      );
    }

    await next();
  });
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }
}, 5 * 60 * 1000);
