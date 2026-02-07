import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { registerInputSchema, loginInputSchema } from "@chatbot/shared";
import { register, login } from "../services/auth.service.js";
import { verifyToken, createTokenPair, setAuthCookies, clearAuthCookies, getRefreshTokenFromCookie } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { AuthError } from "../lib/errors.js";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../app.js";

const auth = new Hono<AppEnv>();

const authLimiter = rateLimit("auth", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_AUTH_PER_MINUTE,
  keyFn: (c) => c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
  message: "Too many attempts. Please wait a minute.",
});

auth.post("/register", authLimiter, zValidator("json", registerInputSchema), async (c) => {
  const input = c.req.valid("json");
  const requestId = c.get("requestId");
  const user = await register(input, c, requestId);
  return c.json({ data: { user } }, 201);
});

auth.post("/login", authLimiter, zValidator("json", loginInputSchema), async (c) => {
  const input = c.req.valid("json");
  const requestId = c.get("requestId");
  const user = await login(input, c, requestId);
  return c.json({ data: { user } });
});

auth.post("/refresh", async (c) => {
  const refreshToken = getRefreshTokenFromCookie(c);
  if (!refreshToken) throw new AuthError("No refresh token");

  const userId = await verifyToken(refreshToken, "refresh");
  const tokens = await createTokenPair(userId);
  setAuthCookies(c, tokens.accessToken, tokens.refreshToken);

  return c.json({ data: { refreshed: true } });
});

auth.post("/logout", (c) => {
  clearAuthCookies(c);
  return c.json({ data: { loggedOut: true } });
});

auth.get("/me", requireAuth, (c) => {
  const userId = c.get("userId");
  const user = db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).get();

  return c.json({ data: { user } });
});

export { auth };
