"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getExtendedUiLocaleCodes,
  PINNED_UI_LOCALE_OPTIONS,
} from "@/lib/ui-locale-picker-codes";
import { normalizeUiLocale } from "@/lib/site-locale";
import { useSiteLocale } from "@/providers/site-locale-provider";

type PickerEntry = { value: string; label: string; pinned: boolean };

function buildPickerEntries(uiLocale: string): PickerEntry[] {
  const pinned: PickerEntry[] = PINNED_UI_LOCALE_OPTIONS.map((p) => ({
    value: p.value,
    label: p.label,
    pinned: true,
  }));

  let dn: Intl.DisplayNames;
  try {
    dn = new Intl.DisplayNames([uiLocale, "en"], { type: "language" });
  } catch {
    try {
      dn = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      return pinned;
    }
  }

  const collator = new Intl.Collator(
    uiLocale.startsWith("zh") ? "zh" : uiLocale.split("-")[0] || "en",
    { sensitivity: "base" },
  );

  const rest: PickerEntry[] = [];
  const seen = new Set(PINNED_UI_LOCALE_OPTIONS.map((p) => p.value));
  for (const raw of getExtendedUiLocaleCodes()) {
    const n = normalizeUiLocale(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    let label = n;
    try {
      const name = dn.of(n);
      if (name && name.trim()) label = `${name.trim()} · ${n}`;
    } catch {
      /* keep code as label */
    }
    rest.push({ value: n, label, pinned: false });
  }
  rest.sort((a, b) => collator.compare(a.label, b.label));
  return [...pinned, ...rest];
}

function filterEntries(entries: PickerEntry[], q: string): PickerEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return entries;
  return entries.filter(
    (e) =>
      e.value.toLowerCase().includes(s) ||
      e.label.toLowerCase().includes(s) ||
      e.value.toLowerCase().replace(/-/g, "").includes(s.replace(/-/g, "")),
  );
}

type SiteLocaleControlProps = {
  id?: string;
  className?: string;
  selectClassName?: string;
};

export function SiteLocaleControl({
  id = "site-ui-locale",
  className = "",
  selectClassName = "",
}: SiteLocaleControlProps) {
  const { locale, setLocale, uiTranslating, t } = useSiteLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const entries = useMemo(() => buildPickerEntries(locale), [locale]);
  const filtered = useMemo(() => filterEntries(entries, search), [entries, search]);

  const currentLabel = useMemo(() => {
    const pin = PINNED_UI_LOCALE_OPTIONS.find((p) => p.value === locale);
    if (pin) return pin.label;
    try {
      const dn = new Intl.DisplayNames([locale, "en"], { type: "language" });
      const base = locale.split("-")[0];
      const name = dn.of(locale) ?? dn.of(base);
      if (name?.trim()) return `${name.trim()} · ${locale}`;
    } catch {
      /* fall through */
    }
    return locale;
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useLayoutEffect(() => {
    if (open) {
      searchRef.current?.focus();
      searchRef.current?.select();
    } else {
      setSearch("");
    }
  }, [open]);

  const pick = useCallback(
    (value: string) => {
      const n = normalizeUiLocale(value);
      if (n) setLocale(n);
      setOpen(false);
    },
    [setLocale],
  );

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-trigger`} className="text-[11px] font-medium text-zinc-400">
          {t("landing.uiLanguage")}
        </label>
        <button
          id={`${id}-trigger`}
          type="button"
          disabled={uiTranslating}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          onClick={() => setOpen((o) => !o)}
          className={
            "flex max-w-[min(220px,70vw)] items-center justify-between gap-2 rounded-lg border border-[#324866] bg-[#0d1625] px-2 py-1 text-left text-[11px] text-zinc-100 hover:border-cyan-500/40 disabled:opacity-50 " +
            selectClassName
          }
        >
          <span className="truncate">{currentLabel}</span>
          <span className="shrink-0 text-zinc-500" aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </button>
        {uiTranslating ? (
          <span className="text-[10px] text-amber-200/80">{t("landing.uiLanguageBusy")}</span>
        ) : null}
      </div>

      {open ? (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label={t("landing.uiLanguage")}
          className="absolute start-0 top-[calc(100%+6px)] z-[100] flex min-w-[min(320px,calc(100vw-2rem))] max-w-[min(400px,calc(100vw-1.5rem))] flex-col rounded-xl border border-[#2a3f5c] bg-[#0a1018] py-2 shadow-xl shadow-black/40"
        >
          <div className="border-b border-[#1e2f48] px-2 pb-2">
            <input
              ref={searchRef}
              id={`${id}-search`}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              placeholder={t("landing.uiLanguageSearchPlaceholder")}
              className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-2 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="max-h-[min(280px,45vh)] overflow-y-auto px-1 pt-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-zinc-500">
                {t("landing.uiLanguageEmpty")}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((e, idx) => {
                  const showAllHeading =
                    !e.pinned && (idx === 0 || Boolean(filtered[idx - 1]?.pinned));
                  return (
                    <li key={e.value}>
                      {showAllHeading ? (
                        <div
                          className={
                            idx === 0
                              ? "mb-0.5"
                              : "mb-0.5 border-t border-[#1e2f48] pt-1.5"
                          }
                          role="presentation"
                        >
                          <span className="block px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            {t("landing.uiLanguageAllLanguages")}
                          </span>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={e.value === locale}
                        onClick={() => pick(e.value)}
                        className={[
                          "flex w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-snug",
                          e.value === locale
                            ? "bg-cyan-900/35 text-cyan-100"
                            : "text-zinc-200 hover:bg-[#152238]",
                          e.pinned ? "font-medium" : "font-normal",
                        ].join(" ")}
                      >
                        <span className="min-w-0 flex-1 break-words">{e.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
