import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { env } from "./env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/logger.js";
import { routes } from "./routes/index.js";

export type AppEnv = {
  Variables: {
    userId: string;
    requestId: string;
  };
};

// Parse FRONTEND_URL — supports comma-separated values for multiple origins
const allowedOrigins = env.FRONTEND_URL.split(",").map((u) => u.trim());

// Vercel preview URL pattern: <project>-<hash>-<team>.vercel.app
const VERCEL_PREVIEW_PATTERN = /^https:\/\/[\w-]+-[\w-]+\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (env.ALLOW_VERCEL_PREVIEWS && VERCEL_PREVIEW_PATTERN.test(origin)) return true;
  return false;
}

export function createApp() {
  const app = new Hono<AppEnv>();

  // Global middleware (order matters — outermost first)
  app.use("*", requestId());
  app.use("*", requestLogger);
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (isAllowedOrigin(origin)) return origin;
        return allowedOrigins[0]; // Fallback to primary
      },
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  // Error handling
  app.onError(errorHandler);

  // API routes
  app.route("/api/v1", routes);

  return app;
}
