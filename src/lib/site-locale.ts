/** Persisted UI language (BCP-47). Machine-translated UI uses cached bundles for non-built-in locales. */
export const SITE_LOCALE_STORAGE_KEY = "chenchen:site:locale:v1";

export const DEFAULT_SITE_LOCALE = "en";

/** Locales with hand-written message catalogs (no MT). */
export const STATIC_UI_LOCALES = ["en", "zh-CN"] as const;
export type StaticUiLocale = (typeof STATIC_UI_LOCALES)[number];

export type SiteUiLocale = string;

export function isStaticUiLocale(value: string): value is StaticUiLocale {
  return value === "en" || value === "zh-CN";
}

/**
 * Normalize user/model locale strings to a safe BCP-47-like tag, or null if invalid.
 */
export function normalizeUiLocale(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || t.length > 24) return null;
  const compact = t.replace(/_/g, "-");
  if (!/^[a-zA-Z]{2,3}([-][a-zA-Z0-9]+)*$/i.test(compact)) return null;
  const parts = compact.split("-");
  const lang = parts[0].toLowerCase();
  if (lang.length < 2) return null;
  const rest = parts.slice(1).map((seg) =>
    seg.length === 2 ? seg.toUpperCase() : seg.toLowerCase(),
  );
  return [lang, ...rest].join("-");
}

/** @deprecated Use isStaticUiLocale */
export function isSiteLocale(value: string): boolean {
  return isStaticUiLocale(value) || normalizeUiLocale(value) !== null;
}

export function siteLocaleToHtmlLang(locale: string): string {
  return normalizeUiLocale(locale) ?? DEFAULT_SITE_LOCALE;
}

export const SITE_UI_MT_CACHE_PREFIX = "chenchen:site:ui-mt:v1:";
