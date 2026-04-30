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
  chapterHasCastExtract,
  fetchChapterHtmlFromSavedContent,
  postChapterCastExtract,
} from "@/lib/chapter-cast-extract-flow";
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
  const [extractAllLoading, setExtractAllLoading] = useState(false);
  const [extractAllProgress, setExtractAllProgress] = useState("");

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
      const loaded = await fetchChapterHtmlFromSavedContent(
        authorId,
        novelId,
        selectedChapterId,
      );
      if (!loaded.ok) {
        throw new Error(loaded.error);
      }
      if (!loaded.html.trim()) {
        window.alert("当前章节无已保存正文（请先在工作台编辑并保存本章）。");
        return;
      }
      const res = await postChapterCastExtract({
        authorId,
        novelId,
        chapterId: selectedChapterId,
        chapterIndex,
        chapterHtml: loaded.html,
      });
      if (!res.ok) {
        if (res.status === 403 && res.code === "subscription_required") {
          window.alert(res.error ?? "需要付费会员订阅后方可使用此 AI 功能。");
          return;
        }
        throw new Error(res.error);
      }
      window.alert(`已写入 ${res.count} 个 JSON（${res.version}）`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "抽取失败");
    } finally {
      setExtractLoading(false);
    }
  }, [authorId, novelId, selectedChapterId, chapterNodes]);

  const handleExtractAllChapters = useCallback(async () => {
    if (!authorId || chapterNodes.length === 0) {
      window.alert("请先连接钱包并确保作品有大纲章节。");
      return;
    }
    if (
      !window.confirm(
        `将按顺序检查全书 ${chapterNodes.length} 章：已有抽取结果的章节会跳过；无正文的章节会跳过；其余逐章调用 AI 抽取登场人物。耗时与章节数有关，是否继续？`,
      )
    ) {
      return;
    }
    setExtractAllLoading(true);
    setExtractAllProgress("");
    let skipped = 0;
    let extracted = 0;
    let emptyBody = 0;
    try {
      for (let i = 0; i < chapterNodes.length; i++) {
        const ch = chapterNodes[i]!;
        const chapterIndex = i + 1;
        setExtractAllProgress(`第 ${chapterIndex}/${chapterNodes.length} 章…`);
        const has = await chapterHasCastExtract(authorId, novelId, ch.id);
        if (has) {
          skipped += 1;
          continue;
        }
        const loaded = await fetchChapterHtmlFromSavedContent(authorId, novelId, ch.id);
        if (!loaded.ok) {
          throw new Error(`第 ${chapterIndex} 章：${loaded.error}`);
        }
        if (!loaded.html.trim()) {
          emptyBody += 1;
          continue;
        }
        const res = await postChapterCastExtract({
          authorId,
          novelId,
          chapterId: ch.id,
          chapterIndex,
          chapterHtml: loaded.html,
        });
        if (!res.ok) {
          if (res.status === 403 && res.code === "subscription_required") {
            window.alert(res.error);
            break;
          }
          throw new Error(
            `第 ${chapterIndex} 章（${ch.title || ch.id}）：${res.error}`,
          );
        }
        extracted += 1;
      }
      setRefreshKey((k) => k + 1);
      window.alert(
        `全书扫描完成。\n跳过（已有抽取）：${skipped} 章\n新抽取：${extracted} 章\n无正文跳过：${emptyBody} 章`,
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "批量抽取失败");
    } finally {
      setExtractAllLoading(false);
      setExtractAllProgress("");
    }
  }, [authorId, novelId, chapterNodes]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900 sm:px-4">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">
              人物信息 · 大开本
            </p>
            <div className="mt-0.5 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <h1 className="truncate text-sm font-semibold leading-tight text-neutral-900 dark:text-neutral-50">
                {novelTitle ?? novelId}
              </h1>
              {authorId && !structureLoading && chapterNodes.length > 0 ? (
                <select
                  className="max-w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-[11px] text-neutral-900 focus:border-violet-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-[min(100%,22rem)] sm:shrink-0"
                  value={selectedChapterId ?? ""}
                  onChange={onSelectChapter}
                  aria-label="当前章节"
                >
                  {chapterNodes.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      第 {i + 1} 章 · {c.title || "未命名"}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <WalletConnect />
            <Link
              href={`/editor/${encodeURIComponent(novelId)}`}
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              返回主编台
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-2 overflow-hidden px-3 py-2 sm:px-4 sm:py-3">
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

        {authorId && !structureLoading && chapterNodes.length > 0 && selectedChapterId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex min-h-0 flex-1 flex-col px-2 py-2 sm:px-3 sm:py-2.5">
              <ChapterCastPanel
                authorId={authorId}
                novelId={novelId}
                chapterId={selectedChapterId}
                refreshKey={refreshKey}
                onExtract={handleExtractChapterCast}
                extractDisabled={
                  !selectedChapterId || extractLoading || extractAllLoading
                }
                extractLoading={extractLoading}
                onExtractAll={handleExtractAllChapters}
                extractAllDisabled={
                  !authorId ||
                  chapterNodes.length === 0 ||
                  extractLoading ||
                  extractAllLoading
                }
                extractAllLoading={extractAllLoading}
                extractAllProgress={extractAllProgress}
                variant="wide"
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
