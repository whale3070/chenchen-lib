"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FloatingReaderAiShell } from "@/components/floating-reader-ai-shell";
import { ReaderAiRecommendPanel } from "@/components/reader-ai-recommend-panel";
import { useWeb3Auth } from "@/hooks/use-web3-auth";
import { useSiteLocale } from "@/providers/site-locale-provider";

type LibraryItem = {
  kind?: "novel" | "audiobook";
  articleId: string;
  title: string;
  synopsis: string;
  publishedAt: string;
  language: string;
  languageLabel: string;
  audioUrl?: string;
  details?: string;
};

const READER_LANG_PREF_KEY = "chenchen:reader:library:langs";
const READER_RECOMMEND_COLLAPSED_KEY = "chenchen:reader:library:recommend-collapsed";
const READER_RECOMMEND_FLOAT_POS_KEY = "chenchen:reader:library:recommend-float-pos:v1";

export default function LibraryPage() {
  const {
    address,
    isConnected,
    isConnectPending,
    connectErrorMessage,
    walletGuideOpen,
    closeWalletGuide,
  } = useWeb3Auth();
  const { t, locale, setLocale } = useSiteLocale();
  const router = useRouter();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"library" | "settings">("library");
  const [contentFilter, setContentFilter] = useState<"all" | "novel" | "audiobook">("all");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["zh"]);

  const aiStrings = useMemo(
    () => ({
      title: t("aiAssistant.title"),
      dragHint: t("aiAssistant.dragHint"),
      collapseLabel: t("aiAssistant.collapseLabel"),
      collapseTitle: t("aiAssistant.collapseTitle"),
      clear: t("aiAssistant.clear"),
      subtitle: t("aiAssistant.subtitle"),
      emptyHint: t("aiAssistant.emptyHint"),
      placeholder: t("aiAssistant.placeholder"),
      send: t("aiAssistant.send"),
      loading: t("aiAssistant.loading"),
      rateLimit: t("aiAssistant.rateLimit"),
      networkError: t("aiAssistant.networkError"),
      networkErrorReply: t("aiAssistant.networkErrorReply"),
      genericErrorReply: t("aiAssistant.genericErrorReply"),
    }),
    [t],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/library/articles", { cache: "no-store" });
        const data = (await res.json()) as { items?: LibraryItem[] };
        setItems(data.items ?? []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(READER_LANG_PREF_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const langs = parsed
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      if (langs.length > 0) setSelectedLangs(Array.from(new Set(langs)));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // 兜底：若当前语言筛选导致空列表，但书库里存在中文作品，则自动补上中文可见。
    if (items.length === 0 || selectedLangs.includes("zh")) return;
    const hasZhItems = items.some((item) => item.language === "zh");
    const hasAnyVisible = items.some((item) => selectedLangs.includes(item.language));
    if (hasZhItems && !hasAnyVisible) {
      setSelectedLangs((prev) => Array.from(new Set([...prev, "zh"])));
    }
  }, [items, selectedLangs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(READER_LANG_PREF_KEY, JSON.stringify(selectedLangs));
    } catch {
      // ignore
    }
  }, [selectedLangs]);

  const handleOpenArticle = async (articleId: string, language: string) => {
    const target =
      language && language !== "zh"
        ? `/library/${encodeURIComponent(articleId)}?lang=${encodeURIComponent(language)}`
        : `/library/${encodeURIComponent(articleId)}`;
    if (!isConnected || !address) {
      // Library list is public entry now; free mode can be read without wallet.
      router.push(target);
      return;
    }
    router.push(target);
  };

  const availableLangs = useMemo(() => {
    const set = new Set(items.map((x) => x.language).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        selectedLangs.length > 0 ? selectedLangs.includes(item.language) : false,
      ),
    [items, selectedLangs],
  );

  const filteredByContentItems = useMemo(
    () =>
      filteredItems.filter((item) => {
        if (contentFilter === "all") return true;
        const kind = item.kind ?? "novel";
        return kind === contentFilter;
      }),
    [filteredItems, contentFilter],
  );

  const groupedItems = useMemo(
    () =>
      filteredByContentItems.reduce<Record<string, LibraryItem[]>>((acc, item) => {
        const key = item.languageLabel || item.language.toUpperCase();
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {}),
    [filteredByContentItems],
  );

  const toggleLang = (lang: string) => {
    setSelectedLangs((prev) => {
      if (prev.includes(lang)) {
        const next = prev.filter((x) => x !== lang);
        return next.length > 0 ? next : prev;
      }
      return [...prev, lang];
    });
  };

  return (
    <div className="relative min-h-screen bg-[#050810] text-zinc-200">
      {isConnected ? (
        <FloatingReaderAiShell
          positionStorageKey={READER_RECOMMEND_FLOAT_POS_KEY}
          collapsedStorageKey={READER_RECOMMEND_COLLAPSED_KEY}
          expandButtonTitle={t("aiAssistant.expandTitle")}
          expandButtonLabel={t("aiAssistant.expandLabel")}
          autoExpandUntilLangOnboardingDone
        >
          {({ onHeaderPointerDown, headerDragging, requestCollapse }) => (
            <ReaderAiRecommendPanel
              strings={aiStrings}
              onCollapse={requestCollapse}
              onHeaderPointerDown={onHeaderPointerDown}
              headerDragging={headerDragging}
              apiLocale={locale}
              languageOnboarding
              onLocaleInferred={setLocale}
            />
          )}
        </FloatingReaderAiShell>
      ) : null}
      <main className="min-h-0 w-full overflow-y-auto px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-cyan-300">读者书库 · 文章 ID</h1>
          <Link
            href="/"
            className="text-sm text-cyan-400 underline-offset-4 hover:text-cyan-300 hover:underline"
          >
            返回首页
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={
              tab === "library"
                ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200"
                : "rounded-md border border-[#2d405e] bg-[#0d1625] px-3 py-1 text-xs text-zinc-300"
            }
          >
            阅读书库
          </button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={
              tab === "settings"
                ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200"
                : "rounded-md border border-[#2d405e] bg-[#0d1625] px-3 py-1 text-xs text-zinc-300"
            }
          >
            读者语言设置
          </button>
        </div>
        {tab === "library" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">内容筛选：</span>
            <button
              type="button"
              onClick={() => setContentFilter("all")}
              className={
                contentFilter === "all"
                  ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200"
                  : "rounded-md border border-[#2d405e] bg-[#0d1625] px-3 py-1 text-xs text-zinc-300"
              }
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setContentFilter("novel")}
              className={
                contentFilter === "novel"
                  ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200"
                  : "rounded-md border border-[#2d405e] bg-[#0d1625] px-3 py-1 text-xs text-zinc-300"
              }
            >
              仅看小说
            </button>
            <button
              type="button"
              onClick={() => setContentFilter("audiobook")}
              className={
                contentFilter === "audiobook"
                  ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200"
                  : "rounded-md border border-[#2d405e] bg-[#0d1625] px-3 py-1 text-xs text-zinc-300"
              }
            >
              仅看有声书
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            加载中…
          </p>
        ) : tab === "settings" ? (
          <section className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4">
            <h2 className="text-sm font-semibold text-cyan-300">选择可见语言（多选）</h2>
            <p className="mt-1 text-xs text-zinc-500">
              勾选哪些语言，就只展示这些语言分区内容。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {availableLangs.map((lang) => (
                <label
                  key={lang}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs ${
                    selectedLangs.includes(lang)
                      ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                      : "border-[#2d405e] bg-[#0d1625] text-zinc-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedLangs.includes(lang)}
                    onChange={() => toggleLang(lang)}
                  />
                  {lang.toUpperCase()}
                </label>
              ))}
            </div>
          </section>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            暂无已发布文章 ID。
          </p>
        ) : filteredByContentItems.length === 0 ? (
          <p className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            当前语言设置下暂无可阅读内容。
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([zoneLabel, zoneItems]) => (
              <section
                key={zoneLabel}
                className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-3"
              >
                <h2 className="mb-2 text-sm font-semibold text-cyan-300">{zoneLabel}</h2>
                <ul className="space-y-2">
                  {zoneItems.map((item) => (
                    <li
                      key={`${item.articleId}-${item.language}`}
                      className="rounded-xl border border-[#1b2b43] bg-[#0d1524] px-4 py-3"
                    >
                      {item.kind === "audiobook" && item.audioUrl ? (
                        <div>
                          <p className="break-words text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">
                            {item.title}
                          </p>
                          {item.synopsis ? (
                            <p className="mt-1 line-clamp-2 break-words text-xs text-zinc-400 [overflow-wrap:anywhere]">
                              {item.synopsis}
                            </p>
                          ) : null}
                          {item.details ? (
                            <p className="mt-1 line-clamp-3 break-words text-xs text-zinc-500 [overflow-wrap:anywhere]">
                              {item.details}
                            </p>
                          ) : null}
                          <p className="mt-1 break-all text-xs text-zinc-500">
                            有声书ID：{item.articleId}
                          </p>
                          <audio controls src={item.audioUrl} className="mt-2 w-full" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleOpenArticle(item.articleId, item.language)}
                          disabled={isConnectPending}
                          className="w-full cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <p className="break-words text-sm font-medium text-zinc-100 [overflow-wrap:anywhere] hover:text-cyan-300">
                            {item.title}
                          </p>
                          {item.synopsis ? (
                            <p className="mt-1 line-clamp-2 break-words text-xs text-zinc-400 [overflow-wrap:anywhere]">
                              {item.synopsis}
                            </p>
                          ) : null}
                          <p className="mt-1 break-all text-xs text-zinc-400">
                            文章ID：{item.articleId}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            语言：{item.language.toUpperCase()}
                          </p>
                          <p className="mt-1 text-xs text-cyan-400">点击阅读</p>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      </main>

      {walletGuideOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={closeWalletGuide}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="MetaMask 安装指南"
            className="w-full max-w-xl rounded-2xl border border-[#1e2a3f] bg-[#0a0e17] p-5 text-zinc-200 shadow-[0_0_40px_rgba(79,195,247,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#4fc3f7]">
              连接失败：请先安装 MetaMask
            </h3>
            {connectErrorMessage ? (
              <p className="mt-2 text-xs text-zinc-400">{connectErrorMessage}</p>
            ) : null}
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
              <li>请使用 Chrome 或 Firefox 浏览器访问本站。</li>
              <li>
                打开 MetaMask 官方下载页：
                <a
                  href="https://metamask.io/download"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 text-cyan-400 underline hover:text-cyan-300"
                >
                  metamask.io/download
                </a>
              </li>
              <li>安装浏览器扩展后，重启浏览器并刷新页面。</li>
              <li>点击“连接钱包”，在 MetaMask 弹窗中确认连接。</li>
            </ol>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeWalletGuide}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
