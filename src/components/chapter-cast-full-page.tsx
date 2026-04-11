"use client";

import type { PlotNode } from "@chenchen/shared/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { ChapterCastPanel } from "@/components/chapter-cast-panel";
import { WalletConnect } from "@/components/wallet-connect";
import {
  contentPayloadToChapterHtmlForExtract,
  type ChapterContentBlob,
} from "@/lib/chapter-content-html-for-extract";
import { useAuthStore } from "@/store/auth-store";

type Props = { novelId: string };

export function ChapterCastFullPage({ novelId }: Props) {
  const authorId = useAuthStore((s) => s.authorId);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [structureLoading, setStructureLoading] = useState(true);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [chapterRows, setChapterRows] = useState<PlotNode[]>([]);
  const [novelTitle, setNovelTitle] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [extractLoading, setExtractLoading] = useState(false);

  const urlSyncedRef = useRef(false);
  const chapterQuerySig = `${searchParams.get("chapterId") ?? ""}|${searchParams.get("chapterIndex") ?? ""}`;
  useEffect(() => {
    urlSyncedRef.current = false;
  }, [novelId, chapterQuerySig]);

  const chapterNodes = useMemo(
    () => chapterRows.filter((n) => n.kind === "chapter"),
    [chapterRows],
  );

  useEffect(() => {
    if (!authorId) {
      setNovelTitle(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/novels/lookup?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          {
            signal: ac.signal,
            headers: { "x-wallet-address": authorId },
          },
        );
        if (!r.ok) return;
        const data = (await r.json()) as { novel?: { title?: string | null } };
        const t = data.novel?.title;
        if (typeof t === "string" && t.trim()) {
          setNovelTitle(t.trim());
        } else {
          setNovelTitle(null);
        }
      } catch {
        if (!ac.signal.aborted) setNovelTitle(null);
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  useEffect(() => {
    if (!authorId) {
      setStructureLoading(false);
      setChapterRows([]);
      setStructureError(null);
      setSelectedChapterId(null);
      return;
    }
    setStructureLoading(true);
    setStructureError(null);
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/update-structure?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(novelId)}`,
          {
            signal: ac.signal,
            headers: { "x-wallet-address": authorId },
          },
        );
        if (ac.signal.aborted) return;
        if (!r.ok) {
          setStructureError(`大纲加载失败（HTTP ${r.status}）`);
          setChapterRows([]);
          setSelectedChapterId(null);
          return;
        }
        const data = (await r.json()) as { nodes: PlotNode[] | null };
        const nodes = data.nodes && data.nodes.length > 0 ? data.nodes : [];
        setChapterRows(nodes);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setStructureError(e instanceof Error ? e.message : "大纲加载失败");
        setChapterRows([]);
        setSelectedChapterId(null);
      } finally {
        if (!ac.signal.aborted) setStructureLoading(false);
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  useEffect(() => {
    if (chapterNodes.length === 0) {
      setSelectedChapterId(null);
      return;
    }
    if (urlSyncedRef.current) return;
    urlSyncedRef.current = true;

    const cid = searchParams.get("chapterId")?.trim();
    const cidx = searchParams.get("chapterIndex")?.trim();
    if (cid && chapterNodes.some((c) => c.id === cid)) {
      setSelectedChapterId(cid);
      return;
    }
    if (cidx) {
      const i = Number.parseInt(cidx, 10);
      if (!Number.isNaN(i) && i >= 1 && i <= chapterNodes.length) {
        setSelectedChapterId(chapterNodes[i - 1]!.id);
        return;
      }
    }
    setSelectedChapterId(chapterNodes[0]!.id);
  }, [chapterNodes, searchParams]);

  const replaceChapterQuery = useCallback(
    (chapterId: string) => {
      const idx = chapterNodes.findIndex((c) => c.id === chapterId) + 1;
      const q = new URLSearchParams();
      q.set("chapterId", chapterId);
      if (idx >= 1) q.set("chapterIndex", String(idx));
      router.replace(`/editor/${novelId}/chapter-cast?${q.toString()}`, { scroll: false });
    },
    [chapterNodes, novelId, router],
  );

  const onSelectChapter = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value.trim();
      if (!id) return;
      setSelectedChapterId(id);
      replaceChapterQuery(id);
    },
    [replaceChapterQuery],
  );

  const handleExtractChapterCast = useCallback(async () => {
    if (!authorId || !selectedChapterId) {
      window.alert("请先连接钱包并选择一章。");
      return;
    }
    const idx = chapterNodes.findIndex((n) => n.id === selectedChapterId);
    if (idx < 0) {
      window.alert("未找到当前章节。");
      return;
    }
    const chapterIndex = idx + 1;
    setExtractLoading(true);
    try {
      const cr = await fetch(
        `/api/v1/chapter-content?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(novelId)}&chapterId=${encodeURIComponent(selectedChapterId)}`,
        { headers: { "x-wallet-address": authorId } },
      );
      const cdata = (await cr.json()) as {
        content?: ChapterContentBlob | null;
        error?: string;
      };
      if (!cr.ok) {
        throw new Error(cdata.error ?? `正文加载失败 HTTP ${cr.status}`);
      }
      const chapterHtml = contentPayloadToChapterHtmlForExtract(cdata.content);
      if (!chapterHtml.trim()) {
        window.alert("当前章节无已保存正文（请先在工作台编辑并保存本章）。");
        return;
      }
      const r = await fetch("/api/v1/chapter-cast/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          chapterId: selectedChapterId,
          chapterIndex,
          chapterHtml,
        }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        version?: string;
        files?: string[];
        count?: number;
        error?: string;
        code?: string;
      };
      if (!r.ok) {
        if (r.status === 403 && data.code === "subscription_required") {
          window.alert(data.error ?? "需要付费会员订阅后方可使用此 AI 功能。");
          return;
        }
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      window.alert(`已写入 ${data.count ?? 0} 个 JSON（${data.version ?? ""}）`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "抽取失败");
    } finally {
      setExtractLoading(false);
    }
  }, [authorId, novelId, selectedChapterId, chapterNodes]);

  const activeChapterTitle = useMemo(() => {
    if (!selectedChapterId) return null;
    const n = chapterNodes.find((c) => c.id === selectedChapterId);
    return n?.title ?? null;
  }, [chapterNodes, selectedChapterId]);

  const activeChapterIndex = useMemo(() => {
    const i = chapterNodes.findIndex((c) => c.id === selectedChapterId);
    return i >= 0 ? i + 1 : null;
  }, [chapterNodes, selectedChapterId]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">
              人物信息 · 大开本
            </p>
            <h1 className="mt-0.5 truncate text-base font-semibold text-neutral-900 dark:text-neutral-50">
              {novelTitle ?? novelId}
            </h1>
            {activeChapterIndex != null && activeChapterTitle ? (
              <p className="mt-1 truncate text-xs text-neutral-600 dark:text-neutral-400">
                第 {activeChapterIndex} 章 · {activeChapterTitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <WalletConnect />
            <Link
              href={`/editor/${encodeURIComponent(novelId)}`}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              返回主编台
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
        {!authorId ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            连接钱包后可查看、抽取与保存本章人物信息。
          </p>
        ) : null}

        {authorId && structureLoading ? (
          <p className="text-sm text-neutral-500">加载作品大纲…</p>
        ) : null}
        {structureError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {structureError}
          </p>
        ) : null}

        {authorId && !structureLoading && chapterNodes.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            当前作品尚无章节节点。请先在主编台建立章节后再使用本页。
          </p>
        ) : null}

        {authorId && !structureLoading && chapterNodes.length > 0 ? (
          <div className="shrink-0 space-y-2">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              当前章节
            </label>
            <select
              className="w-full max-w-xl rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-violet-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
              value={selectedChapterId ?? ""}
              onChange={onSelectChapter}
            >
              {chapterNodes.map((c, i) => (
                <option key={c.id} value={c.id}>
                  第 {i + 1} 章 · {c.title || "未命名"}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {authorId && !structureLoading && chapterNodes.length > 0 && selectedChapterId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex min-h-0 flex-1 flex-col px-2 py-3 sm:px-4">
              <ChapterCastPanel
                authorId={authorId}
                novelId={novelId}
                chapterId={selectedChapterId}
                refreshKey={refreshKey}
                onExtract={handleExtractChapterCast}
                extractDisabled={!selectedChapterId || extractLoading}
                extractLoading={extractLoading}
                variant="wide"
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
