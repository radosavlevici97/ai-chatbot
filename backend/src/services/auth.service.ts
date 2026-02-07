import { eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createTokenPair, setAuthCookies } from "../lib/jwt.js";
import { AuthError, ConflictError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";
import type { Context } from "hono";
import type { RegisterInput, LoginInput, UserProfile } from "@chatbot/shared";

export async function register(
  input: RegisterInput,
  c: Context,
  requestId: string,
): Promise<UserProfile> {
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.email, input.email), eq(users.username, input.username)))
    .get();

  if (existing) {
    log.warn({ requestId, email: input.email }, "Registration conflict");
    throw new ConflictError("Unable to create account. Please try different credentials.");
  }

  const id = nanoid();
  const passwordHash = await hashPassword(input.password);

  db.insert(users).values({
    id,
    email: input.email,
    username: input.username,
    passwordHash,
  }).run();

  const tokens = await createTokenPair(id);
  setAuthCookies(c, tokens.accessToken, tokens.refreshToken);

  log.info({ requestId, userId: id }, "User registered");

  return { id, email: input.email, username: input.username, role: "user", createdAt: new Date().toISOString() };
}

export async function login(
  input: LoginInput,
  c: Context,
  requestId: string,
): Promise<UserProfile> {
  const user = db.select().from(users).where(eq(users.email, input.email)).get();

  if (!user) {
    throw new AuthError("Invalid credentials");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid credentials");
  }

  if (!user.isActive) {
    throw new AuthError("Account deactivated");
  }

  db.update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id))
    .run();

  const tokens = await createTokenPair(user.id);
  setAuthCookies(c, tokens.accessToken, tokens.refreshToken);

  log.info({ requestId, userId: user.id }, "User logged in");

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}
