"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

import { ReaderChapterMarkdown } from "@/components/reader-chapter-markdown";
import { useWeb3Auth } from "@/hooks/use-web3-auth";

type ReaderArticle = {
  articleId: string;
  authorId: string;
  title: string;
  synopsis: string;
  tags: string[];
  updatedAt: string;
  paymentMode: "free" | "paid";
  firstLineIndent?: boolean;
  freePreviewChapters: number;
  unlocked: boolean;
  totalChapters: number;
  chapters: Array<{
    title: string;
    contentHtml: string;
    /** 与作者端 chapterMarkdown 同步；存在时读者用 remark-gfm 渲染（含表格） */
    contentMarkdown?: string;
  }>;
  paymentQrImageDataUrl?: string | null;
  language?: string;
  languageLabel?: string;
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

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

/** 与正文渲染用同一套剥离逻辑 */
function stripHtmlToPlainForReader(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function localizedLanguageLabel(
  langCode: string | undefined,
  fallbackLabel: string | undefined,
  uiLang: "zh" | "en",
): string {
  if (uiLang === "zh") return fallbackLabel || "中文原文";
  const code = (langCode || "").toLowerCase();
  const map: Record<string, string> = {
    zh: "Chinese",
    en: "English",
    ja: "Japanese",
    ko: "Korean",
    fr: "French",
    de: "German",
    es: "Spanish",
    ru: "Russian",
    pt: "Portuguese",
    it: "Italian",
    vi: "Vietnamese",
    th: "Thai",
  };
  return (
    map[code] ??
    (fallbackLabel && !containsCjk(fallbackLabel)
      ? fallbackLabel
      : code.toUpperCase() || "Unknown")
  );
}

function displayChapterTitle(
  index: number,
  rawTitle: string | undefined,
  uiLang: "zh" | "en",
): string {
  const title = (rawTitle ?? "").trim();
  if (uiLang === "zh") return title || `第 ${index + 1} 章`;
  if (!title) return `Chapter ${index + 1}`;
  if (/^第\s*[一二三四五六七八九十百千\d]+\s*章/.test(title) || containsCjk(title)) {
    return `Chapter ${index + 1}`;
  }
  return title;
}

export default function ReaderArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = use(params);
  const searchParams = useSearchParams();
  const langParam = useMemo(() => {
    const raw = (searchParams.get("lang") ?? "").trim().toLowerCase();
    return /^[a-z]{2,5}$/.test(raw) ? raw : "zh";
  }, [searchParams]);
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
  const [readerTab, setReaderTab] = useState<"read" | "speak">("read");
  const [showTipQr, setShowTipQr] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareQrDataUrl, setShareQrDataUrl] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [speakRate, setSpeakRate] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speechCharIndex, setSpeechCharIndex] = useState(0);
  const [visitedChapterIndexes, setVisitedChapterIndexes] = useState<Set<number>>(
    () => new Set([0]),
  );
  const chapterTopRef = useRef<HTMLElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const uiLang = article?.language === "zh" || !article?.language ? "zh" : "en";
  const t =
    uiLang === "zh"
      ? {
          back: "← 返回书库",
          connect: "连接 MetaMask 后阅读",
          loading: "加载中…",
          notFound: "未找到可阅读内容。",
          author: "作者",
          update: "小说更新",
          readMode: "阅读模式",
          free: "免费公开",
          paid: (n: number) => `付费阅读（前 ${n} 章免费）`,
          langZone: "当前语言分区",
          toc: "章节目录",
          readable: (a: number, b: number) => `可读 ${a} / 共 ${b} 章`,
          noChapter: "暂无可阅读章节",
          current: "当前",
          prev: "上一章",
          next: "下一章",
          readTab: "阅读",
          speakTab: "朗读",
          voice: "音色",
          speed: "语速",
          play: "开始朗读",
          pause: "暂停",
          resume: "继续",
          stop: "停止",
          progress: "朗读进度",
          speakingUnavailable: "当前浏览器不支持朗读功能",
          tip: "打赏作者",
          share: "社交媒体分享",
          shareTitle: "社交媒体作品分享",
          shareEntry: "读者分享入口（含钱包标记）",
          wallet: "钱包",
          close: "关闭",
          download: "下载本图片",
          generating: "生成二维码中…",
        }
      : {
          back: "← Back to Library",
          connect: "Connect MetaMask to Read",
          loading: "Loading...",
          notFound: "No readable content found.",
          author: "Author",
          update: "Updated",
          readMode: "Reading Mode",
          free: "Free Public",
          paid: (n: number) => `Paid Reading (first ${n} chapters free)`,
          langZone: "Language",
          toc: "Table of Contents",
          readable: (a: number, b: number) => `Readable ${a} / Total ${b} chapters`,
          noChapter: "No readable chapters.",
          current: "Current",
          prev: "Previous",
          next: "Next",
          readTab: "Read",
          speakTab: "Listen",
          voice: "Voice",
          speed: "Speed",
          play: "Play",
          pause: "Pause",
          resume: "Resume",
          stop: "Stop",
          progress: "Progress",
          speakingUnavailable: "Text-to-speech is unavailable in this browser",
          tip: "Tip Author",
          share: "Social Share",
          shareTitle: "Social Media Share",
          shareEntry: "Reader share entry (wallet marked)",
          wallet: "Wallet",
          close: "Close",
          download: "Download Image",
          generating: "Generating QR...",
        };
  const langZoneLabel = localizedLanguageLabel(
    article?.language,
    article?.languageLabel,
    uiLang,
  );

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
          const apiUrl =
            `/api/v1/library/articles?articleId=${encodeURIComponent(articleId)}` +
            `&lang=${encodeURIComponent(langParam)}`;
          const res = await fetch(apiUrl, {
            headers: wallet ? { "x-wallet-address": wallet } : undefined,
            cache: "no-store",
            signal: ac.signal,
          });
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
  }, [isConnected, address, articleId, langParam]);

  const currentChapter = useMemo(
    () => article?.chapters?.[chapterIndex] ?? null,
    [article, chapterIndex],
  );
  const shareTargetUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const articleLang = article?.language && article.language !== "zh" ? article.language : "";
    const base = articleLang
      ? `${window.location.origin}/library/${articleId}?lang=${encodeURIComponent(articleLang)}`
      : `${window.location.origin}/library/${articleId}`;
    if (!address) return base;
    return `${base}${base.includes("?") ? "&" : "?"}readerWallet=${encodeURIComponent(address)}`;
  }, [address, articleId, article?.language]);

  const currentChapterUseMarkdown = Boolean(
    currentChapter?.contentMarkdown?.trim(),
  );
  const currentChapterPlainText = useMemo(() => {
    const md = currentChapter?.contentMarkdown?.trim();
    if (md) return md;
    return stripHtmlToPlainForReader(currentChapter?.contentHtml ?? "");
  }, [currentChapter]);
  const supportsSpeech = typeof window !== "undefined" && "speechSynthesis" in window;
  const speechVoices = useMemo(() => {
    if (voices.length === 0) return [];
    const lang = article?.language === "en" ? "en" : "zh";
    const filtered = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
    return filtered.length > 0 ? filtered : voices;
  }, [article?.language, voices]);
  const speechProgressPct = useMemo(() => {
    if (!currentChapterPlainText) return 0;
    return Math.min(100, Math.max(0, (speechCharIndex / currentChapterPlainText.length) * 100));
  }, [currentChapterPlainText, speechCharIndex]);

  const stopSpeaking = useCallback(() => {
    if (!supportsSpeech) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
  }, [supportsSpeech]);

  const startSpeaking = useCallback(() => {
    if (!supportsSpeech || !currentChapterPlainText) return;
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(currentChapterPlainText);
    u.lang = article?.language === "en" ? "en-US" : "zh-CN";
    u.rate = speakRate;
    const selected = speechVoices.find((v) => v.name === voiceName);
    if (selected) u.voice = selected;
    u.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeechCharIndex(0);
    };
    u.onboundary = (event: SpeechSynthesisEvent) => {
      if (typeof event.charIndex === "number" && Number.isFinite(event.charIndex)) {
        setSpeechCharIndex(Math.max(0, event.charIndex));
      }
    };
    u.onpause = () => setIsPaused(true);
    u.onresume = () => setIsPaused(false);
    u.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setSpeechCharIndex(currentChapterPlainText.length);
      utteranceRef.current = null;
    };
    u.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      utteranceRef.current = null;
    };
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  }, [
    article?.language,
    currentChapterPlainText,
    speakRate,
    speechVoices,
    stopSpeaking,
    supportsSpeech,
    voiceName,
  ]);

  const pauseSpeaking = useCallback(() => {
    if (!supportsSpeech) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, [supportsSpeech]);

  const resumeSpeaking = useCallback(() => {
    if (!supportsSpeech) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, [supportsSpeech]);
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

    const qrImage = await loadImage(shareQrDataUrl);
    const qrSize = 500;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = 560;
    ctx.fillStyle = "#ffffff";
    roundRectFill(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 20);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "28px sans-serif";
    const intro = article.synopsis || "扫码即可阅读，适合移动端浏览。";
    const introStartY = 330;
    const introLineHeight = 42;
    let cursorY = introStartY;
    const introMaxLines = Math.max(
      2,
      Math.floor((qrY - 120 - introStartY) / introLineHeight),
    );
    const introLines = drawWrappedCenteredTextClamped(
      ctx,
      intro,
      540,
      introStartY,
      820,
      introLineHeight,
      introMaxLines,
    );
    cursorY += introLines * introLineHeight + 12;

    if (article.tags?.length && cursorY < qrY - 44) {
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "24px sans-serif";
      const tagsText = article.tags.slice(0, 8).map((t) => `#${t}`).join("  ");
      const tagsLineHeight = 32;
      const tagsMaxLines = Math.max(
        1,
        Math.floor((qrY - 44 - cursorY) / tagsLineHeight),
      );
      drawWrappedCenteredTextClamped(
        ctx,
        tagsText,
        540,
        cursorY,
        860,
        tagsLineHeight,
        tagsMaxLines,
      );
    }

    const qrCardBottomY = qrY + qrSize + 20;
    const linkStartY = qrCardBottomY + 64;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px sans-serif";
    const shareUrlLines = drawWrappedCenteredText(ctx, shareTargetUrl, 540, linkStartY, 860, 34);

    ctx.fillStyle = "#22d3ee";
    ctx.font = "24px sans-serif";
    const walletLabel = `分享读者钱包：${address ?? "未连接"}`;
    const walletStartY = linkStartY + Math.max(1, shareUrlLines) * 34 + 74;
    drawWrappedCenteredText(ctx, walletLabel, 540, walletStartY, 860, 34);

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
    stopSpeaking();
    setSpeechCharIndex(0);
    setVisitedChapterIndexes((prev) => {
      if (prev.has(chapterIndex)) return prev;
      const next = new Set(prev);
      next.add(chapterIndex);
      return next;
    });
  }, [chapterIndex, stopSpeaking]);

  useEffect(() => {
    if (!supportsSpeech) return;
    const syncVoices = () => {
      const list = window.speechSynthesis.getVoices();
      setVoices(list);
    };
    syncVoices();
    window.speechSynthesis.onvoiceschanged = syncVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [supportsSpeech]);

  useEffect(() => {
    if (speechVoices.length === 0) return;
    if (speechVoices.some((v) => v.name === voiceName)) return;
    setVoiceName(speechVoices[0]?.name ?? "");
  }, [speechVoices, voiceName]);

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
            {t.back}
          </Link>
          {!isConnected && article?.paymentMode === "paid" ? (
            <button
              type="button"
              disabled={isConnectPending}
              onClick={() => void requestConnect()}
              className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-950/40 disabled:opacity-50"
            >
              {isConnectPending ? (uiLang === "zh" ? "连接中…" : "Connecting...") : t.connect}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4 text-sm text-zinc-400">
            <p>加载中…</p>
            <p>{t.loading}</p>
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
            {t.notFound}
          </p>
        ) : (
          <>
            <section
              ref={chapterTopRef}
              className="rounded-xl border border-[#1b2b43] bg-[#09101b] p-4"
            >
              <h1 className="break-words text-xl font-semibold text-zinc-100 [overflow-wrap:anywhere]">
                {article.title}
              </h1>
              <p className="mt-1 break-all text-xs text-zinc-400">
                {t.author}：{article.authorId}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {t.update}：{article.updatedAt || (uiLang === "zh" ? "未知" : "N/A")}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {t.readMode}：
                {article.paymentMode === "free"
                  ? t.free
                  : t.paid(article.freePreviewChapters)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {t.langZone}：{langZoneLabel}
              </p>
              {article.synopsis ? (
                <p className="mt-3 break-words text-sm text-zinc-300 [overflow-wrap:anywhere]">
                  {article.synopsis}
                </p>
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
                    {t.toc} {tocOpen ? "▾" : "▸"}
                  </button>
                  <span className="text-[11px] text-zinc-500">
                    {t.readable(article.chapters.length, article.totalChapters)}
                  </span>
                </div>
                {tocOpen ? (
                  article.chapters.length === 0 ? (
                    <p className="text-xs text-zinc-500">{t.noChapter}</p>
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
                          {displayChapterTitle(idx, c.title, uiLang)}
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    {t.current}：
                    {displayChapterTitle(chapterIndex, currentChapter?.title, uiLang)}
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
                  {displayChapterTitle(chapterIndex, currentChapter?.title, uiLang)}
                </h2>
                <span className="text-xs text-zinc-400">
                  第 {chapterIndex + 1} / {article.chapters.length} 章
                </span>
              </div>

              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReaderTab("read")}
                  className={
                    readerTab === "read"
                      ? "rounded-md border border-cyan-500/60 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200"
                      : "rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-cyan-500/40"
                  }
                >
                  {t.readTab}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReaderTab("speak");
                    if (!isSpeaking && !isPaused) {
                      startSpeaking();
                    }
                  }}
                  className={
                    readerTab === "speak"
                      ? "rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                      : "rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-emerald-500/40"
                  }
                >
                  {t.speakTab}
                </button>
              </div>

              {readerTab === "read" ? (
                currentChapter ? (
                  <div className="min-w-0 overflow-x-auto">
                    <article
                      className={
                        currentChapterUseMarkdown
                          ? [
                              "prose prose-invert max-w-none min-w-0 text-zinc-200",
                              "prose-headings:text-zinc-100 prose-p:my-3 prose-li:my-0.5 prose-hr:border-zinc-600",
                              article.firstLineIndent ? "[&_p]:indent-[2em]" : "",
                            ].join(" ")
                          : [
                              "prose prose-invert max-w-none min-w-0 break-words [overflow-wrap:anywhere]",
                              "[&_*]:max-w-full [&_table]:!max-w-none [&_table_*]:max-w-none",
                              "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-zinc-500/40",
                              "[&_th]:border [&_td]:border [&_th]:border-zinc-500/40 [&_td]:border-zinc-500/40",
                              "[&_th]:bg-zinc-800/60 [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2 [&_th]:text-left [&_td]:text-left",
                              "[&_a]:break-all [&_code]:break-all [&_pre]:overflow-x-auto",
                              "[&_td]:break-words [&_td]:[overflow-wrap:anywhere] [&_th]:break-words [&_th]:[overflow-wrap:anywhere]",
                              article.firstLineIndent ? "[&_p]:indent-[2em]" : "",
                            ].join(" ")
                      }
                    >
                      {currentChapterUseMarkdown ? (
                        <ReaderChapterMarkdown
                          markdown={currentChapter.contentMarkdown!.trim()}
                        />
                      ) : (
                        <div
                          dangerouslySetInnerHTML={{
                            __html:
                              (currentChapter.contentHtml ?? "").trim() ||
                              "<p></p>",
                          }}
                        />
                      )}
                    </article>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">本章暂无内容。</p>
                )
              ) : (
                <div className="space-y-3">
                  {!supportsSpeech ? (
                    <p className="text-sm text-zinc-400">{t.speakingUnavailable}</p>
                  ) : (
                    <>
                      <div className="rounded-lg border border-[#1f3048] bg-[#0b1422] p-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="text-xs text-zinc-400">
                            {t.voice}
                            <select
                              value={voiceName}
                              onChange={(e) => setVoiceName(e.target.value)}
                              className="ml-2 rounded border border-zinc-700 bg-[#0b1320] px-2 py-1 text-xs text-zinc-200"
                            >
                              {speechVoices.map((v) => (
                                <option key={`${v.name}-${v.lang}`} value={v.name}>
                                  {v.name} ({v.lang})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-zinc-400">
                            {t.speed}
                            <input
                              type="range"
                              min={0.6}
                              max={1.6}
                              step={0.1}
                              value={speakRate}
                              onChange={(e) => setSpeakRate(Number(e.target.value))}
                              className="ml-2 align-middle"
                            />
                            <span className="ml-1 text-zinc-300">{speakRate.toFixed(1)}x</span>
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={startSpeaking}
                            className="rounded-md border border-emerald-500/50 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30"
                          >
                            {t.play}
                          </button>
                          <button
                            type="button"
                            disabled={!isSpeaking || isPaused}
                            onClick={pauseSpeaking}
                            className="rounded-md border border-amber-500/50 px-3 py-1 text-xs text-amber-300 hover:bg-amber-950/30 disabled:opacity-40"
                          >
                            {t.pause}
                          </button>
                          <button
                            type="button"
                            disabled={!isSpeaking || !isPaused}
                            onClick={resumeSpeaking}
                            className="rounded-md border border-cyan-500/50 px-3 py-1 text-xs text-cyan-300 hover:bg-cyan-950/30 disabled:opacity-40"
                          >
                            {t.resume}
                          </button>
                          <button
                            type="button"
                            disabled={!isSpeaking && !isPaused}
                            onClick={stopSpeaking}
                            className="rounded-md border border-rose-500/50 px-3 py-1 text-xs text-rose-300 hover:bg-rose-950/30 disabled:opacity-40"
                          >
                            {t.stop}
                          </button>
                        </div>
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                            <span>{t.progress}</span>
                            <span>{speechProgressPct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 rounded bg-zinc-800">
                            <div
                              className="h-2 rounded bg-emerald-400 transition-all"
                              style={{ width: `${speechProgressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#1f3048] bg-[#0b1422] p-3 text-sm leading-7 text-zinc-200">
                        {renderSpeechHighlight(currentChapterPlainText, speechCharIndex)}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  disabled={chapterIndex <= 0}
                  onClick={() => setChapterIndex((i) => Math.max(0, i - 1))}
                  className="rounded-md border border-zinc-600 px-3 py-1 text-xs text-zinc-300 disabled:opacity-40"
                >
                  {t.prev}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTipQr((v) => !v)}
                  className="rounded-md border border-amber-500/50 px-3 py-1 text-xs text-amber-300 hover:bg-amber-950/30"
                >
                  {t.tip}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenShare()}
                  className="rounded-md border border-emerald-500/50 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30"
                >
                  {t.share}
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
                  {t.next}
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
              <h3 className="text-sm font-semibold text-emerald-300">{t.shareTitle}</h3>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300 hover:border-emerald-400 hover:text-emerald-300"
              >
                {t.close}
              </button>
            </div>
            <div className="rounded-xl border border-[#284056] bg-[#101a2c] p-4 text-center">
              <h4 className="text-base font-semibold text-zinc-100">《{article.title}》作品</h4>
              <p className="mt-1 text-xs text-zinc-400">{t.shareEntry}</p>
              {article.synopsis ? (
                <p className="mt-2 line-clamp-3 text-[11px] text-zinc-400">{article.synopsis}</p>
              ) : null}
              {article.tags?.length ? (
                <p className="mt-1 text-[11px] text-sky-300">
                  {article.tags.slice(0, 8).map((t) => `#${t}`).join(" ")}
                </p>
              ) : null}
              <p className="mt-2 break-all text-[10px] text-zinc-500">
                {t.wallet}：{address ?? (uiLang === "zh" ? "未连接" : "Not connected")}
              </p>
              {shareQrDataUrl ? (
                <img
                  src={shareQrDataUrl}
                  alt="读者分享二维码"
                  className="mx-auto mt-4 h-[220px] w-[220px] rounded-lg border border-neutral-700 bg-white p-2"
                />
              ) : (
                <div className="mx-auto mt-4 flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-neutral-700 bg-white p-2 text-xs text-neutral-500">
                  {t.generating}
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
                {t.download}
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

function renderSpeechHighlight(text: string, charIndex: number) {
  if (!text) return <p className="text-zinc-400">本章暂无可朗读文本。</p>;
  const idx = Math.max(0, Math.min(charIndex, text.length));
  const head = text.slice(0, idx);
  const current = idx < text.length ? text.slice(idx, idx + 1) : "";
  const tail = idx < text.length ? text.slice(idx + 1) : "";
  return (
    <p className="whitespace-pre-wrap break-words">
      <span className="text-zinc-300">{head}</span>
      {current ? <mark className="rounded bg-emerald-500/35 px-0.5 text-zinc-50">{current}</mark> : null}
      <span className="text-zinc-500">{tail}</span>
    </p>
  );
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
  return lines.length;
}

function drawWrappedCenteredTextClamped(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const chars = text.split("");
  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const overflowed = lines.length >= maxLines && chars.join("").length > lines.join("").length;
  if (overflowed && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }
  lines.forEach((l, i) => {
    ctx.fillText(l, centerX, startY + i * lineHeight);
  });
  return lines.length;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}
