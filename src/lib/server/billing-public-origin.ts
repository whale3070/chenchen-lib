import type { NextRequest } from "next/server";

/** 拼接 Checkout success/cancel 等跳转用的站点根 URL（优先环境变量）。 */
export function resolveBillingPublicOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (env) return env.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.trim() || "http";
  const host =
    req.headers.get("x-forwarded-host")?.trim() ||
    req.headers.get("host")?.trim() ||
    "";
  return host ? `${proto}://${host}` : "";
}
