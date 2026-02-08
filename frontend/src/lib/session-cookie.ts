/**
 * Lightweight frontend-only cookie so Next.js middleware can detect
 * whether the user has logged in.  Real auth is still validated
 * server-side via the HttpOnly access_token cookie on the API domain.
 */

const COOKIE_NAME = "session";

export function setSessionCookie() {
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function clearSessionCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}
