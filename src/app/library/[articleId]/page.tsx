"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import QRCode from "qrcode";

import { useWeb3Auth } from "@/hooks/use-web3-auth";

type ReaderArticle = {
  articleId: string;
  authorId: string;
  title: string;
  synopsis: string;
  tags: string[];
  updatedAt: string;
  paymentMode: "free" | "paid";
  freePreviewChapters: number;
  unlocked: boolean;
  totalChapters: number;
  chapters: Array<{ title: string; contentHtml: string }>;
  paymentQrImageDataUrl?: string | null;
};

const ARTICLE_LOAD_TIMEOUT_MS = 12000;

function visitedKey(articleId: string) {
  return `chenchen:reader:visited:${articleId}`;
}

function chapterTocLabel(index: number, rawTitle?: string) {
  const base = `第 ${index + 1} 章`;
  const title = (rawTitle ?? "").trim();
  if (!title) return base;
  // If title already includes chapter numbering, avoid duplicate prefix.
  if (/^第\s*[一二三四五六七八九十百千\d]+\s*章/.test(title)) {
    return title;
  }
  return `${base} · ${title}`;
}

export default function ReaderArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = use(params);
  const {
    address,
    isConnected,
    requestConnect,
    isConnectPending,
    connectErrorMessage,
    walletGuideOpen,
    closeWalletGuide,
  } = useWeb3Auth();

  const [article, setArticle] = useState<ReaderArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [showTipQr, setShowTipQr] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareQrDataUrl, setShareQrDataUrl] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [visitedChapterIndexes, setVisitedChapterIndexes] = useState<Set<number>>(
    () => new Set([0]),
  );
  const chapterTopRef = useRef<HTMLElement | null>(null);

  const loadArticle = async (wallet?: string) => {
    setLoading(true);
    setLoadingSlow(false);
    try {
      let loaded = false;
      let lastError: unknown = null;
      for (let i = 0; i < 2; i += 1) {
        const ac = new AbortController();
        const timeout = window.setTimeout(() => ac.abort(), ARTICLE_LOAD_TIMEOUT_MS);
        try {
          const res = await fetch(
            `/api/v1/library/articles?articleId=${encodeURIComponent(articleId)}`,
            {
              headers: wallet ? { "x-wallet-address": wallet } : undefined,
              cache: "no-store",
              signal: ac.signal,
            },
          );
          const data = (await res.json()) as { article?: ReaderArticle; error?: string };
          if (!res.ok || !data.article) {
            throw new Error(data.error ?? "加载失败");
          }
          setArticle(data.article);
          setChapterIndex(0);
          setShowTipQr(false);
          setVisitedChapterIndexes(new Set([0]));
          loaded = true;
          break;
        } catch (e) {
          lastError = e;
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!loaded) {
        throw lastError instanceof Error
          ? lastError
          : new Error("加载失败，请稍后重试");
      }
    } catch (e) {
      setArticle(null);
      if (e instanceof DOMException && e.name === "AbortError") {
        window.alert("加载超时，请检查网络后重试");
      } else {
        window.alert(e instanceof Error ? e.message : "加载失败");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      setLoadingSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setLoadingSlow(true), 2500);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    void (async () => {
      await loadArticle(isConnected && address ? address : undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, articleId]);

  const currentChapter = useMemo(
    () => article?.chapters?.[chapterIndex] ?? null,
    [article, chapterIndex],
  );
  const shareTargetUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}/library/${articleId}`;
    if (!address) return base;
    return `${base}?readerWallet=${encodeURIComponent(address)}`;
  }, [address, articleId]);

  const currentChapterRenderedHtml = useMemo(() => {
    const raw = currentChapter?.contentHtml ?? "";
    if (!raw) return "<p></p>";
    const plain = raw
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    const looksLikeMarkdown =
      /!\[[^\]]*\]\([^)]+\)/.test(plain) ||
      /(?:^|\n)\s{0,3}#{1,6}\s+/.test(plain) ||
      /(?:^|\n)\s*[-*+]\s+/.test(plain);
    if (!looksLikeMarkdown) return raw;
    return marked.parse(plain, { breaks: true }) as string;
  }, [currentChapter]);
  const hasMoreLockedChapters = Boolean(
    article &&
      article.paymentMode === "paid" &&
      !article.unlocked &&
      article.totalChapters > article.chapters.length,
  );

  const handleUnlockPaid = async () => {
    if (!isConnected || !address) {
      await requestConnect();
      return;
    }
    setUnlocking(true);
    try {
      const res = await fetch("/api/v1/library/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({ articleId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "支付解锁失败");
      }
      await loadArticle(address);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "支付解锁失败");
    } finally {
      setUnlocking(false);
    }
  };

  const handleOpenShare = useCallback(async () => {
    if (!address) {
      await requestConnect();
      return;
    }
    setShareOpen(true);
  }, [address, requestConnect]);

  const handleDownloadShareImage = useCallback(async () => {
    if (!article || !shareQrDataUrl || !shareTargetUrl) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1520;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      window.alert("生成分享图失败：无法初始化画布");
      return;
    }

    ctx.fillStyle = "#0b1320";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#101a2c";
    roundRectFill(ctx, 70, 60, 940, 1400, 28);

    ctx.fillStyle = "#e5e7eb";
    ctx.font = "bold 52px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`《${article.title}》作品`, 540, 185);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "34px sans-serif";
    ctx.fillText("读者社交分享入口", 540, 245);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "28px sans-serif";
    const intro = article.synopsis || "扫码即可阅读，适合移动端浏览。";
    drawWrappedCenteredText(ctx, intro, 540, 330, 820, 44);

    if (article.tags?.length) {
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "24px sans-serif";
      const tagsText = article.tags.slice(0, 8).map((t) => `#${t}`).join("  ");
      drawWrappedCenteredText(ctx, tagsText, 540, 445, 860, 34);
    }

    const qrImage = await loadImage(shareQrDataUrl);
    const qrSize = 500;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = 490;
    ctx.fillStyle = "#ffffff";
    roundRectFill(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 20);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px sans-serif";
    drawWrappedCenteredText(ctx, shareTargetUrl, 540, 1085, 860, 34);

    ctx.fillStyle = "#22d3ee";
    ctx.font = "24px sans-serif";
    const walletLabel = `分享读者钱包：${address ?? "未连接"}`;
    drawWrappedCenteredText(ctx, walletLabel, 540, 1295, 860, 34);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${article.title}-读者社交分享图.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [address, article, shareQrDataUrl, shareTargetUrl]);

  useEffect(() => {
    const key = visitedKey(articleId);
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = parsed
        .filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0)
        .slice(0, 500);
      if (valid.length > 0) {
        setVisitedChapterIndexes(new Set(valid));
      }
    } catch {
      // ignore cache parse errors
    }
  }, [articleId]);

  useEffect(() => {
    const key = visitedKey(articleId);
    try {
      const list = Array.from(visitedChapterIndexes).sort((a, b) => a - b);
      window.localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // ignore storage write errors
    }
  }, [articleId, visitedChapterIndexes]);

  useEffect(() => {
    if (!article) return;
    setVisitedChapterIndexes((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i >= 0 && i < article.chapters.length) next.add(i);
      }
      if (!next.has(0)) next.add(0);
      if (next.size === prev.size && Array.from(next).every((x) => prev.has(x))) {
        return prev;
      }
      return next;
    });
  }, [article]);

  useEffect(() => {
    // Fix reading UX: after chapter switch, always jump to chapter top.
    chapterTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    setVisitedChapterIndexes((prev) => {
      if (prev.has(chapterIndex)) return prev;
      const next = new Set(prev);
      next.add(chapterIndex);
      return next;
    });
  }, [chapterIndex]);

  useEffect(() => {
    if (!shareOpen || !address || !shareTargetUrl) {
      setShareQrDataUrl("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(shareTargetUrl, {
      width: 520,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (!cancelled) setShareQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setShareQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [address, shareOpen, shareTargetUrl]);

  return (
    <div className="min-h-screen bg-[#050810] px-6 py-8 text-zinc-200">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link
            href="/library"
            className="text-sm text-cyan-400 underline-offset-4 hover:text-cyan-300 hover:underline"
          >
            ← 返回书库
          </Link>
          {!isConnected && article?.paymentMode === "paid" ? (
            <button
              type="button"
              disabled={isConnectPending}
              onClick={() => void requestConnect()}
              className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-950/40 disabled:opacity-50"
            >
              {isConnectPending ? "连接中…" : "连接 MetaMask 后阅读"}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            <p>加载中…</p>
            {loadingSlow ? (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  当前网络或服务较慢，正在重试请求。
                </span>
                <button
                  type="button"
                  onClick={() => void loadArticle(isConnected && address ? address : undefined)}
                  className="rounded border border-cyan-500/40 px-2 py-0.5 text-xs text-cyan-300 hover:bg-cyan-950/30"
                >
                  立即重试
                </button>
              </div>
            ) : null}
          </div>
        ) : !article ? (
          <p className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            未找到可阅读内容。
          </p>
        ) : (
          <>
            <section
              ref={chapterTopRef}
              className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4"
            >
              <h1 className="text-xl font-semibold text-zinc-100">{article.title}</h1>
              <p className="mt-1 text-xs text-zinc-400">作者：{article.authorId}</p>
              <p className="mt-1 text-xs text-zinc-400">
                小说更新：{article.updatedAt || "未知"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                阅读模式：
                {article.paymentMode === "free"
                  ? "免费公开"
                  : `付费阅读（前 ${article.freePreviewChapters} 章免费）`}
              </p>
              {article.synopsis ? (
                <p className="mt-3 text-sm text-zinc-300">{article.synopsis}</p>
              ) : null}
            </section>

            <section className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4">
              <div className="mb-4 rounded-lg border border-[#1f3048] bg-[#0b1422] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setTocOpen((v) => !v)}
                    className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    章节目录 {tocOpen ? "▾" : "▸"}
                  </button>
                  <span className="text-[11px] text-zinc-500">
                    可读 {article.chapters.length} / 共 {article.totalChapters} 章
                  </span>
                </div>
                {tocOpen ? (
                  article.chapters.length === 0 ? (
                    <p className="text-xs text-zinc-500">暂无可阅读章节</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {article.chapters.map((c, idx) => (
                        <button
                          key={`${c.title}-${idx}`}
                          type="button"
                          onClick={() => setChapterIndex(idx)}
                          className={
                            idx === chapterIndex
                              ? "rounded-md border border-cyan-500/60 bg-cyan-500/10 px-2.5 py-1.5 text-left text-xs text-cyan-200"
                              : visitedChapterIndexes.has(idx)
                                ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-left text-xs text-emerald-200 hover:border-emerald-400/60"
                              : "rounded-md border border-zinc-700 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:border-cyan-500/40 hover:bg-cyan-950/20"
                          }
                        >
                          {chapterTocLabel(idx, c.title)}
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    当前：{chapterTocLabel(chapterIndex, currentChapter?.title)}
                  </p>
                )}
                {hasMoreLockedChapters ? (
                  <p className="mt-2 text-[11px] text-amber-300/90">
                    后续章节已上锁，解锁后目录会自动扩展。
                  </p>
                ) : null}
              </div>

              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-cyan-300">
                  {currentChapter?.title ?? "未命名章节"}
                </h2>
                <span className="text-xs text-zinc-400">
                  第 {chapterIndex + 1} / {article.chapters.length} 章
                </span>
              </div>

              {currentChapter ? (
                <article
                  className="prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: currentChapterRenderedHtml }}
                />
              ) : (
                <p className="text-sm text-zinc-400">本章暂无内容。</p>
              )}

              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  disabled={chapterIndex <= 0}
                  onClick={() => setChapterIndex((i) => Math.max(0, i - 1))}
                  className="rounded-md border border-zinc-600 px-3 py-1 text-xs text-zinc-300 disabled:opacity-40"
                >
                  上一章
                </button>
                <button
                  type="button"
                  onClick={() => setShowTipQr((v) => !v)}
                  className="rounded-md border border-amber-500/50 px-3 py-1 text-xs text-amber-300 hover:bg-amber-950/30"
                >
                  打赏作者
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenShare()}
                  className="rounded-md border border-emerald-500/50 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30"
                >
                  社交媒体分享
                </button>
                <button
                  type="button"
                  disabled={
                    chapterIndex >= article.chapters.length - 1 && !hasMoreLockedChapters
                  }
                  onClick={() =>
                    setChapterIndex((i) => Math.min(article.chapters.length - 1, i + 1))
                  }
                  className="rounded-md border border-cyan-500/40 px-3 py-1 text-xs text-cyan-300 disabled:opacity-40"
                >
                  下一章
                </button>
              </div>
              {hasMoreLockedChapters ? (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
                  <p className="text-xs text-amber-200">
                    已读完前 {article.freePreviewChapters} 章免费内容。后续章节需连接
                    MetaMask 并完成付费解锁。
                  </p>
                  <button
                    type="button"
                    disabled={unlocking}
                    onClick={() => void handleUnlockPaid()}
                    className="mt-2 rounded-md border border-amber-500/50 px-3 py-1 text-xs text-amber-200 hover:bg-amber-950/30 disabled:opacity-40"
                  >
                    {unlocking
                      ? "解锁中…"
                      : isConnected
                        ? "付费解锁后续章节"
                        : "连接 MetaMask 并付费解锁"}
                  </button>
                </div>
              ) : null}
              {showTipQr ? (
                <div className="mt-4 rounded-lg border border-[#2b405f] bg-[#0b1320] p-3">
                  {article.paymentQrImageDataUrl ? (
                    <img
                      src={article.paymentQrImageDataUrl}
                      alt="作者收款码"
                      className="mx-auto max-h-80 rounded-md border border-zinc-700"
                    />
                  ) : (
                    <p className="text-center text-xs text-zinc-400">
                      作者暂未上传收款码
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          </>
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
            <div className="mt-4 flex justify-end">
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

      {shareOpen && article ? (
        <div
          className="fixed inset-0 z-[121] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => setShareOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="读者社交分享"
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-[#0b1320] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-300">社交媒体作品分享</h3>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300 hover:border-emerald-400 hover:text-emerald-300"
              >
                关闭
              </button>
            </div>
            <div className="rounded-xl border border-[#284056] bg-[#101a2c] p-4 text-center">
              <h4 className="text-base font-semibold text-zinc-100">《{article.title}》作品</h4>
              <p className="mt-1 text-xs text-zinc-400">读者分享入口（含钱包标记）</p>
              {article.synopsis ? (
                <p className="mt-2 line-clamp-3 text-[11px] text-zinc-400">{article.synopsis}</p>
              ) : null}
              {article.tags?.length ? (
                <p className="mt-1 text-[11px] text-sky-300">
                  {article.tags.slice(0, 8).map((t) => `#${t}`).join(" ")}
                </p>
              ) : null}
              <p className="mt-2 break-all text-[10px] text-zinc-500">
                钱包：{address ?? "未连接"}
              </p>
              {shareQrDataUrl ? (
                <img
                  src={shareQrDataUrl}
                  alt="读者分享二维码"
                  className="mx-auto mt-4 h-[220px] w-[220px] rounded-lg border border-neutral-700 bg-white p-2"
                />
              ) : (
                <div className="mx-auto mt-4 flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-neutral-700 bg-white p-2 text-xs text-neutral-500">
                  生成二维码中…
                </div>
              )}
              <p className="mt-2 break-all text-[10px] text-zinc-500">
                {shareTargetUrl || "链接生成中..."}
              </p>
              <button
                type="button"
                disabled={!shareQrDataUrl}
                onClick={() => void handleDownloadShareImage()}
                className="mt-3 rounded-md border border-emerald-500/50 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下载本图片
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roundRectFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawWrappedCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
) {
  const chars = text.split("");
  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    ctx.fillText(l, centerX, startY + i * lineHeight);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}
