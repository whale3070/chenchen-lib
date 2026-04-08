"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

import { useWeb3Auth } from "@/hooks/use-web3-auth";
import { siteLocaleToHtmlLang } from "@/lib/site-locale";
import { useSiteLocale } from "@/providers/site-locale-provider";

/** Syncs `<html lang>` with the persisted site UI locale; home + guest → `en`. */
export function SiteHtmlLang() {
  const { locale } = useSiteLocale();
  const pathname = usePathname();
  const { isConnected } = useWeb3Auth();

  const lang =
    pathname === "/" && !isConnected ? "en" : siteLocaleToHtmlLang(locale);

  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
