"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ChapterCastCharacter, ChapterCastFilePayload } from "@/types/chapter-cast";

type ListFile = { fileName: string; payload: ChapterCastFilePayload };

const inputCls =
  "mt-0.5 w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-violet-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500";

const labelCls = "text-xs text-neutral-500 dark:text-neutral-400";

function draftFromPayload(p: ChapterCastFilePayload): ChapterCastCharacter {
  return { ...p.character };
}

type Props = {
  authorId: string | null;
  novelId: string;
  chapterId: string | null;
  /** 抽取成功后父组件递增 */
  refreshKey: number;
  onExtract: () => void | Promise<void>;
  extractDisabled: boolean;
  extractLoading: boolean;
  /** compact：侧栏竖条；wide：全页左列表右表单 */
  variant?: "compact" | "wide";
};

export function ChapterCastPanel({
  authorId,
  novelId,
  chapterId,
  refreshKey,
  onExtract,
  extractDisabled,
  extractLoading,
  variant = "compact",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [resolvedVersion, setResolvedVersion] = useState<string | null>(null);
  const [versionPicker, setVersionPicker] = useState<string | null>(null);
  const [files, setFiles] = useState<ListFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChapterCastCharacter | null>(null);
  const [basePayload, setBasePayload] = useState<ChapterCastFilePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeEntry = useMemo(
    () => files.find((f) => f.fileName === activeFile) ?? null,
    [files, activeFile],
  );

  const effectiveVersion = versionPicker ?? resolvedVersion;

  const load = useCallback(async () => {
    if (!authorId || !chapterId) return;
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({
        authorId,
        novelId,
        chapterId,
      });
      if (versionPicker) sp.set("version", versionPicker);
      const r = await fetch(`/api/v1/chapter-cast?${sp.toString()}`, {
        headers: { "x-wallet-address": authorId },
        cache: "no-store",
      });
      const data = (await r.json()) as {
        versions?: string[];
        version?: string | null;
        files?: ListFile[];
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      const vs = data.versions ?? [];
      const v = data.version ?? null;
      const fsList = data.files ?? [];
      setVersions(vs);
      setResolvedVersion(v);
      setFiles(fsList);
      setActiveFile((cur) => {
        if (cur && fsList.some((f) => f.fileName === cur)) return cur;
        return fsList[0]?.fileName ?? null;
      });
      const first = fsList[0];
      if (first) {
        setBasePayload(first.payload);
        setDraft(draftFromPayload(first.payload));
      } else {
        setBasePayload(null);
        setDraft(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setVersions([]);
      setResolvedVersion(null);
      setFiles([]);
      setActiveFile(null);
      setBasePayload(null);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [authorId, novelId, chapterId, versionPicker]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    setVersionPicker(null);
  }, [chapterId, novelId, authorId, refreshKey]);

  useEffect(() => {
    if (!activeEntry) {
      setBasePayload(null);
      setDraft(null);
      return;
    }
    setBasePayload(activeEntry.payload);
    setDraft(draftFromPayload(activeEntry.payload));
  }, [activeEntry]);

  const dirty = useMemo(() => {
    if (!draft || !basePayload) return false;
    return JSON.stringify(draft) !== JSON.stringify(basePayload.character);
  }, [draft, basePayload]);

  const handleSave = useCallback(async () => {
    if (!draft || !basePayload || !effectiveVersion || !activeFile || !authorId) return;
    const nextPayload: ChapterCastFilePayload = {
      ...basePayload,
      character: draft,
    };
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/chapter-cast", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          chapterId,
          version: effectiveVersion,
          fileName: activeFile,
          payload: nextPayload,
        }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string; code?: string };
      if (!r.ok) {
        if (r.status === 403 && data.code === "subscription_required") {
          throw new Error(data.error ?? "需要付费会员订阅后方可保存。");
        }
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      setBasePayload(nextPayload);
      setFiles((prev) =>
        prev.map((f) =>
          f.fileName === activeFile ? { fileName: activeFile, payload: nextPayload } : f,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [authorId, novelId, chapterId, effectiveVersion, activeFile, draft, basePayload]);

  const handleDelete = useCallback(async () => {
    if (!authorId || !chapterId || !effectiveVersion || !activeFile) return;
    const name = files.find((f) => f.fileName === activeFile)?.payload.character.name ?? "";
    if (
      !window.confirm(
        `确定删除「${name || activeFile}」的人物信息文件？\n此操作不可恢复。`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/chapter-cast", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          chapterId,
          version: effectiveVersion,
          fileName: activeFile,
        }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string; code?: string };
      if (!r.ok) {
        if (r.status === 403 && data.code === "subscription_required") {
          throw new Error(data.error ?? "需要付费会员订阅后方可删除。");
        }
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }, [authorId, novelId, chapterId, effectiveVersion, activeFile, files, load]);

  if (!authorId) {
    return (
      <p className="px-2 py-4 text-center text-xs text-neutral-500">
        连接钱包后可查看、抽取本章人物信息。
      </p>
    );
  }

  if (!chapterId) {
    return (
      <p className="px-2 py-4 text-center text-xs text-neutral-500">
        {variant === "wide" ? "请在上方选择一章。" : "请在大纲中选中一章。"}
      </p>
    );
  }

  const taLong = variant === "wide" ? "min-h-[96px]" : "min-h-[64px]";
  const taMed = variant === "wide" ? "min-h-[72px]" : "min-h-[52px]";

  const toolbar = (
    <div
      className={[
        "shrink-0 space-y-2 px-2 pt-1",
        variant === "wide" ? "lg:flex lg:flex-row lg:items-end lg:gap-3 lg:space-y-0" : "",
      ].join(" ")}
    >
      <button
        type="button"
        disabled={extractDisabled || extractLoading}
        onClick={() => void onExtract()}
        className={[
          "rounded-lg border border-violet-400/80 bg-violet-50 px-2 py-2 text-xs font-medium text-violet-950 disabled:cursor-not-allowed disabled:opacity-45 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-100",
          variant === "wide" ? "w-full lg:flex-1" : "w-full",
        ].join(" ")}
      >
        {extractLoading ? "AI 正在分析本章正文…" : "AI 抽取本章登场人物"}
      </button>
      {versions.length > 0 ? (
        <div className={variant === "wide" ? "w-full shrink-0 lg:w-52" : ""}>
          <label className={labelCls}>版本</label>
          <select
            className={`${inputCls} mt-0.5`}
            value={(versionPicker ?? resolvedVersion) || ""}
            onChange={(e) => setVersionPicker(e.target.value || null)}
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );

  const statusBlock = (
    <>
      {loading ? <p className="px-2 text-xs text-neutral-500">加载中…</p> : null}
      {error ? (
        <p className="mx-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {!loading && versions.length === 0 ? (
        <p className="px-2 text-center text-[11px] leading-snug text-neutral-500">
          尚无人物信息。点击上方按钮分析当前章正文，每人写入一个 JSON（新版本目录 v1、v2…）。
        </p>
      ) : null}
    </>
  );

  const listHint =
    variant === "wide" ? "（点击切换；大屏下左侧列表可纵向滚动）" : "（上下滑动列表，点击切换）";

  const listUl = (
    <ul
      className={[
        "overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/50",
        variant === "wide"
          ? "min-h-0 max-h-[36vh] flex-1 lg:max-h-none"
          : "max-h-[min(40vh,260px)]",
      ].join(" ")}
      role="listbox"
      aria-label="本章登场人物列表"
    >
      {files.map((f) => {
        const sel = f.fileName === activeFile;
        const pres = f.payload.character.presence?.trim();
        return (
          <li key={f.fileName} className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
            <button
              type="button"
              role="option"
              aria-selected={sel}
              onClick={() => setActiveFile(f.fileName)}
              className={[
                "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors lg:text-xs",
                sel
                  ? "bg-violet-50 font-medium text-violet-900 dark:bg-violet-950/50 dark:text-violet-100"
                  : "text-neutral-800 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800/60",
              ].join(" ")}
              title={f.fileName}
            >
              <span className="truncate">{f.payload.character.name}</span>
              {pres ? (
                <span className="line-clamp-3 text-[11px] font-normal text-neutral-500 dark:text-neutral-400 lg:line-clamp-2 lg:text-[10px]">
                  {pres}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const formInner =
    draft && basePayload ? (
      <div className="space-y-3 pt-1 lg:space-y-4">
        <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
          文件 <span className="font-mono">{activeFile}</span>
        </p>
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/30">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            标识
          </p>
          <div className="space-y-2">
            <div>
              <label className={labelCls}>姓名</label>
              <input
                className={inputCls}
                value={draft.name}
                maxLength={64}
                onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              />
            </div>
            <div>
              <label className={labelCls}>拼音 slug（文件名用）</label>
              <input
                className={`${inputCls} font-mono text-xs`}
                value={draft.namePinyin}
                maxLength={48}
                onChange={(e) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          namePinyin: e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "")
                            .slice(0, 48),
                        }
                      : d,
                  )
                }
              />
            </div>
            <div>
              <label className={labelCls}>stableId</label>
              <input
                className={`${inputCls} font-mono text-xs`}
                value={draft.stableId}
                maxLength={512}
                onChange={(e) => setDraft((d) => (d ? { ...d, stableId: e.target.value } : d))}
              />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/30">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            基础
          </p>
          <div className="space-y-2">
            <div>
              <label className={labelCls}>年龄</label>
              <input
                className={inputCls}
                value={draft.age ?? ""}
                maxLength={64}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, age: e.target.value || undefined } : d))
                }
              />
            </div>
            <div>
              <label className={labelCls}>地点</label>
              <input
                className={inputCls}
                value={draft.location ?? ""}
                maxLength={500}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, location: e.target.value || undefined } : d))
                }
              />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/30">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            描写
          </p>
          <div className="space-y-2">
            <div>
              <label className={labelCls}>外貌</label>
              <textarea
                className={`${inputCls} ${taLong} resize-y`}
                value={draft.appearance ?? ""}
                maxLength={2000}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, appearance: e.target.value || undefined } : d))
                }
              />
            </div>
            <div>
              <label className={labelCls}>性格</label>
              <textarea
                className={`${inputCls} ${taLong} resize-y`}
                value={draft.personality ?? ""}
                maxLength={2000}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, personality: e.target.value || undefined } : d))
                }
              />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/30">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            本章与备注
          </p>
          <div className="space-y-2">
            <div>
              <label className={labelCls}>本章登场 / 戏份</label>
              <textarea
                className={`${inputCls} ${taMed} resize-y`}
                value={draft.presence ?? ""}
                maxLength={1000}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, presence: e.target.value || undefined } : d))
                }
              />
            </div>
            <div>
              <label className={labelCls}>备注</label>
              <textarea
                className={`${inputCls} ${taMed} resize-y`}
                value={draft.notes ?? ""}
                maxLength={2000}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, notes: e.target.value || undefined } : d))
                }
              />
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-white/95 py-3 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/90">
          <button
            type="button"
            disabled={!dirty || saving || deleting}
            onClick={() => void handleSave()}
            className="rounded-md border border-violet-500/50 bg-violet-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-400/40 dark:bg-violet-700/80"
          >
            {saving ? "保存中…" : "保存修改"}
          </button>
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => void handleDelete()}
            className="rounded-md border border-red-500/50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            {deleting ? "删除中…" : "删除此人物信息"}
          </button>
          {!dirty ? <span className="text-[10px] text-neutral-400">无未保存更改</span> : null}
        </div>
      </div>
    ) : null;

  if (variant === "wide") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {toolbar}
        {statusBlock}
        {files.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6">
            <div className="flex min-h-0 w-full shrink-0 flex-col gap-1 px-2 lg:w-80">
              <p className="shrink-0 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                登场人物
                <span className="ml-1 font-normal text-neutral-500">{listHint}</span>
              </p>
              {listUl}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 lg:border-l lg:border-neutral-200 lg:pl-6 dark:lg:border-neutral-800">
              {formInner}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {toolbar}
      {statusBlock}
      {files.length > 0 ? (
        <>
          <div className="shrink-0 px-2">
            <p className="mb-1 text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
              登场人物
              <span className="ml-1 font-normal text-neutral-500">{listHint}</span>
            </p>
            {listUl}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {draft && basePayload ? (
              <div className="space-y-2 pt-2">
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  文件 <span className="font-mono">{activeFile}</span>
                </p>
                <div>
                  <label className={labelCls}>姓名</label>
                  <input
                    className={inputCls}
                    value={draft.name}
                    maxLength={64}
                    onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                  />
                </div>
                <div>
                  <label className={labelCls}>拼音 slug（文件名用）</label>
                  <input
                    className={`${inputCls} font-mono text-xs`}
                    value={draft.namePinyin}
                    maxLength={48}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              namePinyin: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9]/g, "")
                                .slice(0, 48),
                            }
                          : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>stableId</label>
                  <input
                    className={`${inputCls} font-mono text-xs`}
                    value={draft.stableId}
                    maxLength={512}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, stableId: e.target.value } : d))
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>年龄</label>
                  <input
                    className={inputCls}
                    value={draft.age ?? ""}
                    maxLength={64}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, age: e.target.value || undefined } : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>外貌</label>
                  <textarea
                    className={`${inputCls} min-h-[64px] resize-y`}
                    value={draft.appearance ?? ""}
                    maxLength={2000}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, appearance: e.target.value || undefined } : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>性格</label>
                  <textarea
                    className={`${inputCls} min-h-[64px] resize-y`}
                    value={draft.personality ?? ""}
                    maxLength={2000}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, personality: e.target.value || undefined } : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>地点</label>
                  <input
                    className={inputCls}
                    value={draft.location ?? ""}
                    maxLength={500}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, location: e.target.value || undefined } : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>本章登场 / 戏份</label>
                  <textarea
                    className={`${inputCls} min-h-[52px] resize-y`}
                    value={draft.presence ?? ""}
                    maxLength={1000}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, presence: e.target.value || undefined } : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>备注</label>
                  <textarea
                    className={`${inputCls} min-h-[52px] resize-y`}
                    value={draft.notes ?? ""}
                    maxLength={2000}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, notes: e.target.value || undefined } : d,
                      )
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!dirty || saving || deleting}
                    onClick={() => void handleSave()}
                    className="rounded-md border border-violet-500/50 bg-violet-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-400/40 dark:bg-violet-700/80"
                  >
                    {saving ? "保存中…" : "保存修改"}
                  </button>
                  <button
                    type="button"
                    disabled={saving || deleting}
                    onClick={() => void handleDelete()}
                    className="rounded-md border border-red-500/50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    {deleting ? "删除中…" : "删除此人物信息"}
                  </button>
                  {!dirty ? (
                    <span className="text-[10px] text-neutral-400">无未保存更改</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
