import type { Metadata } from "next";
import { cookies } from "next/headers";

import {
  DEFAULT_SITE_LOCALE,
  GEO_UI_LOCALE_COOKIE,
  normalizeUiLocale,
  siteLocaleToHtmlLang,
} from "@/lib/site-locale";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

/**
 * 不使用 next/font/google（Geist）：生产环境部分反代会对 /__nextjs_font/ 返回 403，
 * 导致样式资源失败并可能影响 Hydration。改用语义清晰的系统/黑体栈（globals.css）。
 */
export const metadata: Metadata = {
  title: "Babel Tower · AI writing platform",
  description:
    "AI-assisted editor for novels and scripts (MiroFish narrative tools). UI language defaults from IP (e.g. CN → 简体, HK/TW → 繁体) until you choose in the reader AI panel or Account; override with GEO_COUNTRY_OVERRIDE for dev.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const rawGeo = jar.get(GEO_UI_LOCALE_COOKIE)?.value ?? null;
  const normalized = rawGeo ? normalizeUiLocale(rawGeo) : null;
  const htmlLang = siteLocaleToHtmlLang(normalized ?? DEFAULT_SITE_LOCALE);

  return (
    <html lang={htmlLang} className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans">
        <AppProviders initialLocaleHint={rawGeo}>{children}</AppProviders>
      </body>
    </html>
  );
}
