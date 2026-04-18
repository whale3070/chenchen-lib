import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";

/**
 * 仅在 HTTPS 请求上附加 `Secure`。若生产环境仍用 HTTP 访问，带 Secure 的 Cookie 会被浏览器丢弃，
 * 导致 /auth/me 无法恢复会话（刷新后丢失邮箱登录态）。
 * 可选：AUTH_COOKIE_SECURE=1 强制 Secure；AUTH_COOKIE_SECURE=0 强制不附加。
 */
export function shouldUseSecureCookie(req: NextRequest): boolean {
  if (process.env.AUTH_COOKIE_SECURE === "1") return true;
  if (process.env.AUTH_COOKIE_SECURE === "0") return false;
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0].trim().toLowerCase() === "https";
  }
  return req.nextUrl.protocol === "https:";
}

export function buildAuthSetCookie(token: string, req: NextRequest): string {
  const maxAge = 60 * 60 * 24 * 30;
  const secure = shouldUseSecureCookie(req) ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function buildAuthClearCookie(req: NextRequest): string {
  const secure = shouldUseSecureCookie(req) ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
