"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useWeb3Auth } from "@/hooks/use-web3-auth";

type LibraryItem = {
  articleId: string;
  title: string;
  synopsis: string;
  publishedAt: string;
  language: string;
  languageLabel: string;
};

const READER_LANG_PREF_KEY = "chenchen:reader:library:langs";

export default function LibraryPage() {
  const {
    address,
    isConnected,
    isConnectPending,
    connectErrorMessage,
    walletGuideOpen,
    closeWalletGuide,
  } = useWeb3Auth();
  const router = useRouter();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"library" | "settings">("library");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["en"]);

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

  const groupedItems = useMemo(
    () =>
      filteredItems.reduce<Record<string, LibraryItem[]>>((acc, item) => {
        const key = item.languageLabel || item.language.toUpperCase();
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {}),
    [filteredItems],
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
    <div className="min-h-screen bg-[#050810] px-6 py-10 text-zinc-200">
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
        ) : filteredItems.length === 0 ? (
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
                      <button
                        type="button"
                        onClick={() => void handleOpenArticle(item.articleId, item.language)}
                        disabled={isConnectPending}
                        className="w-full cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <p className="text-sm font-medium text-zinc-100 hover:text-cyan-300">
                          {item.title}
                        </p>
                        {item.synopsis ? (
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                            {item.synopsis}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-zinc-400">文章ID：{item.articleId}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          语言：{item.language.toUpperCase()}
                        </p>
                        <p className="mt-1 text-xs text-cyan-400">点击阅读</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

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
