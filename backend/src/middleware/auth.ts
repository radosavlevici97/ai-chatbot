import { createMiddleware } from "hono/factory";
import { verifyToken, getAccessTokenFromCookie } from "../lib/jwt.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { AuthError } from "../lib/errors.js";
import type { AppEnv } from "../app.js";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getAccessTokenFromCookie(c);
  if (!token) {
    throw new AuthError("Authentication required");
  }

  const userId = await verifyToken(token, "access");

  const user = db.select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user || !user.isActive) {
    throw new AuthError("User not found or deactivated");
  }

  c.set("userId", userId);
  await next();
});
