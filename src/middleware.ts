import { type NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { verifyAuthToken } from "@/lib/auth/jwt";
import { countryCodeToUiLocale } from "@/lib/geo-locale";
import { GEO_UI_LOCALE_COOKIE } from "@/lib/site-locale";

/**
 * Email sessions use HttpOnly JWT cookies. Existing API routes expect `x-wallet-address`
 * (viem isAddress). When the header is missing or invalid, inject it from a valid session cookie.
 * If a valid wallet header is present, it always wins (no cookie conflict checks).
 *
 * All matched requests: set `chenchen_geo_ui_locale` from IP country (Cloudflare / Vercel / x-geo-country
 * / GEO_COUNTRY_OVERRIDE) so the client can default UI language before user saves a preference.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response: NextResponse;

  if (pathname.startsWith("/api/v1/") && !pathname.startsWith("/api/v1/auth/")) {
    const headerAddr = request.headers.get("x-wallet-address")?.trim() ?? "";
    if (isAddress(headerAddr)) {
      response = NextResponse.next();
    } else {
      const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
      if (!token) {
        response = NextResponse.next();
      } else {
        try {
          const session = await verifyAuthToken(token);
          const sub = session?.sub?.trim() ?? "";
          if (!sub || !isAddress(sub)) {
            response = NextResponse.next();
          } else {
            const headers = new Headers(request.headers);
            headers.set("x-wallet-address", sub);
            response = NextResponse.next({ request: { headers } });
          }
        } catch {
          response = NextResponse.next();
        }
      }
    }
  } else {
    response = NextResponse.next();
  }

  applyGeoLocaleCookie(request, response);
  return response;
}

function resolveCountryCode(request: NextRequest): string {
  const override = process.env.GEO_COUNTRY_OVERRIDE?.trim();
  if (override) return override.toUpperCase();
  const fromCf = request.headers.get("cf-ipcountry")?.trim() ?? "";
  if (fromCf) return fromCf.toUpperCase();
  const fromVercel = request.headers.get("x-vercel-ip-country")?.trim() ?? "";
  if (fromVercel) return fromVercel.toUpperCase();
  const fromProxy = request.headers.get("x-geo-country")?.trim() ?? "";
  if (fromProxy) return fromProxy.toUpperCase();
  return "";
}

function applyGeoLocaleCookie(request: NextRequest, response: NextResponse) {
  const cc = resolveCountryCode(request);
  const locale = countryCodeToUiLocale(cc);
  if (locale) {
    response.cookies.set(GEO_UI_LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
      sameSite: "lax",
    });
  } else {
    response.cookies.delete(GEO_UI_LOCALE_COOKIE);
  }
}

export const config = {
  matcher: [
    "/api/v1/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
