"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useWeb3Auth } from "@/hooks/use-web3-auth";

type LibraryItem = {
  articleId: string;
  title: string;
  synopsis: string;
  publishedAt: string;
};

type ArticleDetail = {
  articleId: string;
  title: string;
  synopsis: string;
  contentHtml: string;
  updatedAt: string;
};

export default function LibraryPage() {
  const {
    address,
    isConnected,
    requestConnect,
    isConnectPending,
    connectErrorMessage,
    walletGuideOpen,
    closeWalletGuide,
  } = useWeb3Auth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingArticleId, setPendingArticleId] = useState<string | null>(null);
  const [activeArticle, setActiveArticle] = useState<ArticleDetail | null>(null);
  const [reading, setReading] = useState(false);

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

  const readArticle = async (articleId: string, wallet: string) => {
    setReading(true);
    try {
      const res = await fetch(
        `/api/v1/library/articles?articleId=${encodeURIComponent(articleId)}`,
        {
          headers: { "x-wallet-address": wallet },
          cache: "no-store",
        },
      );
      const data = (await res.json()) as { article?: ArticleDetail; error?: string };
      if (!res.ok || !data.article) {
        throw new Error(data.error ?? "加载失败");
      }
      setActiveArticle(data.article);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "加载失败");
    } finally {
      setReading(false);
    }
  };

  const handleOpenArticle = async (articleId: string) => {
    if (!isConnected || !address) {
      setPendingArticleId(articleId);
      await requestConnect();
      return;
    }
    await readArticle(articleId, address);
  };

  useEffect(() => {
    if (!pendingArticleId || !isConnected || !address) return;
    void readArticle(pendingArticleId, address);
    setPendingArticleId(null);
  }, [pendingArticleId, isConnected, address]);

  const modalTitle = useMemo(
    () => activeArticle?.title ?? "阅读正文",
    [activeArticle?.title],
  );

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

        {loading ? (
          <p className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            加载中…
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            暂无已发布文章 ID。
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.articleId}
                className="rounded-xl border border-[#1b2b43] bg-[#09101b] px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => void handleOpenArticle(item.articleId)}
                  disabled={reading || isConnectPending}
                  className="w-full cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="text-sm font-medium text-zinc-100 hover:text-cyan-300">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">文章ID：{item.articleId}</p>
                  <p className="mt-1 text-xs text-cyan-400">
                    点击阅读（需连接 MetaMask）
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activeArticle ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setActiveArticle(null)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#2b405f] bg-[#0b1320] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-cyan-300">{modalTitle}</h2>
              <button
                type="button"
                onClick={() => setActiveArticle(null)}
                className="rounded-lg border border-zinc-600 px-3 py-1 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
              >
                关闭
              </button>
            </div>
            {activeArticle.contentHtml ? (
              <article
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: activeArticle.contentHtml }}
              />
            ) : (
              <p className="text-sm text-zinc-400">当前暂无可读正文内容。</p>
            )}
          </div>
        </div>
      ) : null}

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
