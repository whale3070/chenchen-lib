"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { readCookieClient } from "@/lib/cookies-client";
import { getEnglishSiteMessages, translateKey } from "@/i18n/site-messages";
import {
  DEFAULT_SITE_LOCALE,
  GEO_UI_LOCALE_COOKIE,
  isStaticUiLocale,
  normalizeUiLocale,
  SITE_LOCALE_STORAGE_KEY,
  SITE_UI_MT_CACHE_PREFIX,
} from "@/lib/site-locale";

type SiteLocaleContextValue = {
  locale: string;
  setLocale: (next: string) => void;
  t: (key: string) => string;
  /** True while machine-translating UI strings for non en/zh-CN locales */
  uiTranslating: boolean;
};

const SiteLocaleContext = createContext<SiteLocaleContextValue | null>(null);

function initialLocaleFromServerHint(hint: string | null | undefined): string {
  const n = hint ? normalizeUiLocale(hint) : null;
  return n ?? DEFAULT_SITE_LOCALE;
}

export function SiteLocaleProvider({
  children,
  initialLocaleHint,
}: {
  children: ReactNode;
  /** From `cookies().get(GEO_UI_LOCALE_COOKIE)` — IP 推断语言，可被 localStorage 覆盖 */
  initialLocaleHint?: string | null;
}) {
  const [locale, setLocaleState] = useState<string>(() =>
    initialLocaleFromServerHint(initialLocaleHint),
  );
  const [mtBundle, setMtBundle] = useState<Record<string, string> | null>(null);
  const [uiTranslating, setUiTranslating] = useState(false);

  useLayoutEffect(() => {
    try {
      const raw = window.localStorage.getItem(SITE_LOCALE_STORAGE_KEY);
      const saved = raw ? normalizeUiLocale(raw) : null;
      if (saved) {
        setLocaleState(saved);
        return;
      }
      const fromCookie = readCookieClient(GEO_UI_LOCALE_COOKIE);
      const geo = fromCookie ? normalizeUiLocale(fromCookie) : null;
      if (geo) setLocaleState(geo);
    } catch {
      /* ignore */
    }
  }, []);

  const setLocale = useCallback((next: string) => {
    const n = normalizeUiLocale(next) ?? DEFAULT_SITE_LOCALE;
    setLocaleState(n);
    try {
      window.localStorage.setItem(SITE_LOCALE_STORAGE_KEY, n);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isStaticUiLocale(locale)) {
      setMtBundle(null);
      setUiTranslating(false);
      return;
    }

    let cancelled = false;
    const cacheKey = `${SITE_UI_MT_CACHE_PREFIX}${locale}`;

    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (raw) {
        const p = JSON.parse(raw) as unknown;
        if (p && typeof p === "object" && !Array.isArray(p)) {
          setMtBundle(p as Record<string, string>);
          setUiTranslating(false);
          return;
        }
      }
    } catch {
      /* ignore */
    }

    setUiTranslating(true);
    const messages = getEnglishSiteMessages();

    void fetch("/api/v1/site/translate-ui-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLocale: locale, messages }),
    })
      .then((r) => r.json())
      .then((data: { translations?: Record<string, string> }) => {
        if (cancelled || !data.translations) return;
        setMtBundle(data.translations);
        try {
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify(data.translations),
          );
        } catch {
          /* ignore */
        }
      })
      .finally(() => {
        if (!cancelled) setUiTranslating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useCallback(
    (key: string) => translateKey(locale, key, mtBundle),
    [locale, mtBundle],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, uiTranslating }),
    [locale, setLocale, t, uiTranslating],
  );

  return (
    <SiteLocaleContext.Provider value={value}>
      {children}
    </SiteLocaleContext.Provider>
  );
}

export function useSiteLocale(): SiteLocaleContextValue {
  const ctx = useContext(SiteLocaleContext);
  if (!ctx) {
    throw new Error("useSiteLocale must be used within SiteLocaleProvider");
  }
  return ctx;
}

export function useSiteLocaleOptional(): SiteLocaleContextValue | null {
  return useContext(SiteLocaleContext);
}
