import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Context } from "hono";
import { env } from "../env.js";
import { AuthError } from "./errors.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

type TokenType = "access" | "refresh";

interface CustomPayload extends JWTPayload {
  sub: string;
  type: TokenType;
}

export async function signToken(userId: string, type: TokenType): Promise<string> {
  const expiresIn =
    type === "access"
      ? `${env.JWT_ACCESS_EXPIRE_MINUTES}m`
      : `${env.JWT_REFRESH_EXPIRE_DAYS}d`;

  return new SignJWT({ type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string, expectedType: TokenType): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret) as { payload: CustomPayload };

    if (payload.type !== expectedType) {
      throw new AuthError("Invalid token type");
    }
    if (!payload.sub) {
      throw new AuthError("Invalid token payload");
    }

    return payload.sub;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("Token expired or invalid");
  }
}

export async function createTokenPair(userId: string) {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(userId, "access"),
    signToken(userId, "refresh"),
  ]);
  return { accessToken, refreshToken };
}

// ── Cookie Helpers ──────────────────────────────

export function setAuthCookies(c: Context, accessToken: string, refreshToken: string) {
  c.header(
    "Set-Cookie",
    `access_token=${accessToken}; Max-Age=${env.JWT_ACCESS_EXPIRE_MINUTES * 60}; HttpOnly; ${env.COOKIE_SECURE ? "Secure; " : ""}SameSite=Strict; Path=/api`,
    { append: true },
  );
  c.header(
    "Set-Cookie",
    `refresh_token=${refreshToken}; Max-Age=${env.JWT_REFRESH_EXPIRE_DAYS * 86400}; HttpOnly; ${env.COOKIE_SECURE ? "Secure; " : ""}SameSite=Strict; Path=/api/v1/auth/refresh`,
    { append: true },
  );
}

export function clearAuthCookies(c: Context) {
  c.header("Set-Cookie", "access_token=; Max-Age=0; HttpOnly; Path=/api", { append: true });
  c.header("Set-Cookie", "refresh_token=; Max-Age=0; HttpOnly; Path=/api/v1/auth/refresh", { append: true });
}

export function getAccessTokenFromCookie(c: Context): string | null {
  const cookies = c.req.header("cookie") ?? "";
  const match = cookies.match(/access_token=([^;]+)/);
  return match?.[1] ?? null;
}

export function getRefreshTokenFromCookie(c: Context): string | null {
  const cookies = c.req.header("cookie") ?? "";
  const match = cookies.match(/refresh_token=([^;]+)/);
  return match?.[1] ?? null;
}
