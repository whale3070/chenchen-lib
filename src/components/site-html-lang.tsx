"use client";

import { useLayoutEffect } from "react";

import { siteLocaleToHtmlLang } from "@/lib/site-locale";
import { useSiteLocale } from "@/providers/site-locale-provider";

/** Syncs `<html lang>` with the site UI locale (localStorage / IP geo / default). */
export function SiteHtmlLang() {
  const { locale } = useSiteLocale();
  const lang = siteLocaleToHtmlLang(locale);

  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
