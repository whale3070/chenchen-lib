"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import { WalletConnect } from "@/components/wallet-connect";
import { useAuthStore } from "@/store/auth-store";

type TranslationStore = {
  authorId: string;
  novelId: string;
  updatedAt: string;
  languages?: Record<
    string,
    {
      updatedAt: string;
      displayTitle?: string;
      displaySynopsis?: string;
      tags?: string[];
      draftText?: string;
      manualText?: string;
      chapters?: Record<
        string,
        {
          translatedText: string;
          updatedAt: string;
        }
      >;
    }
  >;
};

type ChapterRow = { id: string; title: string };

type Props = { novelId: string };

function tagsToInput(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return "";
  return tags.join(", ");
}

function inputToTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function NovelTranslationManagePage({ novelId }: Props) {
  const authorId = useAuthStore((s) => s.authorId);

  const [novelTitle, setNovelTitle] = useState<string | null>(null);
  const [store, setStore] = useState<TranslationStore | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [extraLangs, setExtraLangs] = useState<string[]>([]);
  const [activeLang, setActiveLang] = useState("en");

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterText, setChapterText] = useState("");
  const [chapterDirty, setChapterDirty] = useState(false);

  const [displayTitle, setDisplayTitle] = useState("");
  const [displaySynopsis, setDisplaySynopsis] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [metaDirty, setMetaDirty] = useState(false);

  const [articleId, setArticleId] = useState<string | null>(null);

  const [savingChapter, setSavingChapter] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  const langList = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(store?.languages ?? {}),
      ...extraLangs,
    ]);
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [store?.languages, extraLangs]);

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
        if (typeof t === "string" && t.trim()) setNovelTitle(t.trim());
        else setNovelTitle(null);
      } catch {
        if (!ac.signal.aborted) setNovelTitle(null);
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  useEffect(() => {
    if (!authorId) {
      setArticleId(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/novel-publish?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          {
            signal: ac.signal,
            headers: { "x-wallet-address": authorId },
          },
        );
        if (!r.ok) {
          setArticleId(null);
          return;
        }
        const data = (await r.json()) as { record?: { articleId?: string } };
        const aid = data.record?.articleId;
        setArticleId(typeof aid === "string" && aid.trim() ? aid.trim() : null);
      } catch {
        if (!ac.signal.aborted) setArticleId(null);
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const reloadAll = useCallback(async () => {
    if (!authorId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [sr, tr] = await Promise.all([
        fetch(
          `/api/v1/novel-translation/store?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          { headers: { "x-wallet-address": authorId } },
        ),
        fetch(
          `/api/v1/novel-translation/sources?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          { headers: { "x-wallet-address": authorId } },
        ),
      ]);
      if (!sr.ok) {
        const err = (await sr.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `加载译本失败 HTTP ${sr.status}`);
      }
      if (!tr.ok) {
        const err = (await tr.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `加载章节列表失败 HTTP ${tr.status}`);
      }
      const sdata = (await sr.json()) as { store?: TranslationStore };
      const tdata = (await tr.json()) as {
        chapters?: Array<{ id: string; title: string }>;
      };
      setStore(sdata.store ?? null);
      const ch = (tdata.chapters ?? [])
        .map((c) => ({
          id: typeof c.id === "string" ? c.id : "",
          title: typeof c.title === "string" ? c.title : "",
        }))
        .filter((c) => c.id);
      setChapters(ch);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载失败");
      setStore(null);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }, [authorId, novelId]);

  useEffect(() => {
    if (!authorId) {
      setLoading(false);
      setStore(null);
      setChapters([]);
      setLoadError(null);
      return;
    }
    void reloadAll();
  }, [authorId, novelId, reloadAll]);

  useEffect(() => {
    if (langList.length === 0) return;
    if (!langList.includes(activeLang)) {
      setActiveLang(langList[0]!);
    }
  }, [langList, activeLang]);

  useEffect(() => {
    if (chapters.length === 0) {
      setSelectedChapterId(null);
      return;
    }
    if (!selectedChapterId || !chapters.some((c) => c.id === selectedChapterId)) {
      setSelectedChapterId(chapters[0]!.id);
    }
  }, [chapters, selectedChapterId]);

  const langNode = store?.languages?.[activeLang];

  useEffect(() => {
    setDisplayTitle(langNode?.displayTitle ?? "");
    setDisplaySynopsis(langNode?.displaySynopsis ?? "");
    setTagsInput(tagsToInput(langNode?.tags));
    setMetaDirty(false);
  }, [activeLang, langNode?.displayTitle, langNode?.displaySynopsis, langNode?.tags]);

  useEffect(() => {
    if (!selectedChapterId) {
      setChapterText("");
      setChapterDirty(false);
      return;
    }
    const t =
      store?.languages?.[activeLang]?.chapters?.[selectedChapterId]?.translatedText ??
      "";
    setChapterText(t);
    setChapterDirty(false);
  }, [activeLang, selectedChapterId, store?.languages]);

  const trySetActiveLang = useCallback(
    (next: string) => {
      if (next === activeLang) return;
      if (chapterDirty || metaDirty) {
        const ok = window.confirm("当前有未保存修改，切换语言将丢弃这些修改，是否继续？");
        if (!ok) return;
      }
      setActiveLang(next);
    },
    [activeLang, chapterDirty, metaDirty],
  );

  const trySelectChapter = useCallback(
    (nextId: string) => {
      if (nextId === selectedChapterId) return;
      if (chapterDirty) {
        const ok = window.confirm("本章译文未保存，切换章节将丢弃编辑内容，是否继续？");
        if (!ok) return;
      }
      setSelectedChapterId(nextId);
    },
    [chapterDirty, selectedChapterId],
  );

  const handleAddLanguage = useCallback(() => {
    const raw = window.prompt("新语言代码（如 en、zh-tw、ja）", "");
    if (raw === null) return;
    const code = raw.trim().toLowerCase();
    if (!code) return;
    if (!/^[a-z0-9-]{1,24}$/i.test(code)) {
      window.alert("语言代码格式无效，请使用字母、数字与短横线，最长 24 位。");
      return;
    }
    if (chapterDirty || metaDirty) {
      const ok = window.confirm(
        "当前有未保存修改，添加并切换到新语言将丢弃这些修改，是否继续？",
      );
      if (!ok) return;
    }
    setExtraLangs((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setActiveLang(code);
    setChapterDirty(false);
    setMetaDirty(false);
  }, [chapterDirty, metaDirty]);

  const saveChapter = useCallback(async () => {
    if (!authorId || !selectedChapterId) {
      window.alert("请先连接钱包并选择章节。");
      return;
    }
    setSavingChapter(true);
    setSaveBanner(null);
    try {
      const r = await fetch("/api/v1/novel-translation/store", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          language: activeLang,
          chapterId: selectedChapterId,
          translatedText: chapterText,
        }),
      });
      const data = (await r.json()) as { store?: TranslationStore; error?: string };
      if (!r.ok) throw new Error(data.error ?? `保存失败 HTTP ${r.status}`);
      if (data.store) setStore(data.store);
      setChapterDirty(false);
      setSaveBanner("章节译文已保存");
      window.setTimeout(() => setSaveBanner(null), 3500);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingChapter(false);
    }
  }, [authorId, novelId, activeLang, selectedChapterId, chapterText]);

  const saveMeta = useCallback(async () => {
    if (!authorId) {
      window.alert("请先连接钱包。");
      return;
    }
    setSavingMeta(true);
    setSaveBanner(null);
    try {
      const r = await fetch("/api/v1/novel-translation/store", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          language: activeLang,
          displayTitle,
          displaySynopsis,
          tags: inputToTags(tagsInput),
        }),
      });
      const data = (await r.json()) as { store?: TranslationStore; error?: string };
      if (!r.ok) throw new Error(data.error ?? `保存失败 HTTP ${r.status}`);
      if (data.store) setStore(data.store);
      setMetaDirty(false);
      setSaveBanner("译本标题与简介已保存");
      window.setTimeout(() => setSaveBanner(null), 3500);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingMeta(false);
    }
  }, [authorId, novelId, activeLang, displayTitle, displaySynopsis, tagsInput]);

  const openReaderPreview = useCallback(() => {
    if (!articleId) return;
    const q = activeLang ? `?lang=${encodeURIComponent(activeLang)}` : "";
    window.open(`/library/${encodeURIComponent(articleId)}${q}`, "_blank", "noopener,noreferrer");
  }, [articleId, activeLang]);

  const onChapterSelect = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      trySelectChapter(e.target.value.trim());
    },
    [trySelectChapter],
  );

  const chapterProgress = useMemo(() => {
    if (!store?.languages?.[activeLang]?.chapters || chapters.length === 0) {
      return { done: 0, total: chapters.length };
    }
    const map = store.languages[activeLang]!.chapters!;
    let done = 0;
    for (const c of chapters) {
      const t = map[c.id]?.translatedText ?? "";
      if (t.trim()) done += 1;
    }
    return { done, total: chapters.length };
  }, [store?.languages, activeLang, chapters]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900 sm:px-4">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
              翻译管理
            </p>
            <h1 className="truncate text-sm font-semibold leading-tight text-neutral-900 dark:text-neutral-50">
              {novelTitle ?? novelId}
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <WalletConnect />
            {articleId ? (
              <button
                type="button"
                onClick={openReaderPreview}
                className="rounded-md border border-cyan-600/50 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-800 transition-colors hover:bg-cyan-500/20 dark:text-cyan-200 dark:hover:bg-cyan-500/15"
              >
                读者预览
              </button>
            ) : null}
            <Link
              href={`/editor/${encodeURIComponent(novelId)}`}
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              返回主编台
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-3 overflow-auto px-3 py-3 sm:px-4">
        {!authorId ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            连接钱包后可查看与编辑译本。
          </p>
        ) : null}

        {authorId && loading ? (
          <p className="text-sm text-neutral-500">加载译本与章节…</p>
        ) : null}
        {loadError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {loadError}
          </p>
        ) : null}
        {saveBanner ? (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
            {saveBanner}
          </p>
        ) : null}

        {authorId && !loading && store ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <section className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  已有语言
                </h2>
                <button
                  type="button"
                  onClick={handleAddLanguage}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  添加语言
                </button>
              </div>
              {langList.length === 0 ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  尚无译本记录。可点击「添加语言」开始编辑。
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {langList.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => trySetActiveLang(code)}
                      className={
                        code === activeLang
                          ? "rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white"
                          : "rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-[11px] font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                      }
                    >
                      {code}
                      {store.languages?.[code] ? (
                        <span className="ml-1 text-[10px] opacity-80">✓</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
              {chapters.length > 0 ? (
                <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  当前语言已覆盖 {chapterProgress.done} / {chapterProgress.total} 章（有非空译文）
                </p>
              ) : null}
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                译本展示信息（{activeLang}）
              </h2>
              <div className="flex flex-col gap-2">
                <label className="block text-[11px] text-neutral-600 dark:text-neutral-300">
                  展示标题
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-cyan-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    value={displayTitle}
                    onChange={(e) => {
                      setDisplayTitle(e.target.value);
                      setMetaDirty(true);
                    }}
                    placeholder="可选：读者端标题"
                  />
                </label>
                <label className="block text-[11px] text-neutral-600 dark:text-neutral-300">
                  展示简介
                  <textarea
                    className="mt-1 min-h-[72px] w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-cyan-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    value={displaySynopsis}
                    onChange={(e) => {
                      setDisplaySynopsis(e.target.value);
                      setMetaDirty(true);
                    }}
                    placeholder="可选：该语言简介"
                  />
                </label>
                <label className="block text-[11px] text-neutral-600 dark:text-neutral-300">
                  标签（逗号分隔）
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-cyan-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    value={tagsInput}
                    onChange={(e) => {
                      setTagsInput(e.target.value);
                      setMetaDirty(true);
                    }}
                    placeholder="如 奇幻, 冒险"
                  />
                </label>
                <button
                  type="button"
                  disabled={savingMeta || !metaDirty}
                  onClick={() => void saveMeta()}
                  className="self-start rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingMeta ? "保存中…" : "保存展示信息"}
                </button>
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800 sm:px-4">
                {chapters.length === 0 ? (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    当前作品尚无章节。请先在主编台建立章节后再编辑译文。
                  </p>
                ) : (
                  <label className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300">
                    <span className="shrink-0 font-medium text-neutral-800 dark:text-neutral-200">
                      章节
                    </span>
                    <select
                      className="max-w-full flex-1 rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-sm text-neutral-900 focus:border-cyan-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-md"
                      value={selectedChapterId ?? ""}
                      onChange={onChapterSelect}
                    >
                      {chapters.map((c, i) => (
                        <option key={c.id} value={c.id}>
                          第 {i + 1} 章 · {c.title || "未命名"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {chapters.length > 0 && selectedChapterId ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 sm:p-4">
                  <textarea
                    className="min-h-[200px] flex-1 w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-2 font-mono text-sm leading-relaxed text-neutral-900 focus:border-cyan-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                    value={chapterText}
                    onChange={(e) => {
                      setChapterText(e.target.value);
                      setChapterDirty(true);
                    }}
                    placeholder="本章译文（Markdown 或纯文本）"
                    spellCheck={false}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingChapter || !chapterDirty}
                      onClick={() => void saveChapter()}
                      className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingChapter ? "保存中…" : "保存本章译文"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
