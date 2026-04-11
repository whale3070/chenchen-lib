"use client";

import type { PlotNode } from "@chenchen/shared/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { WalletConnect } from "@/components/wallet-connect";
import type {
  CharacterArcCustomRow,
  CharacterArcMaster,
  CharacterCastTimelineRow,
} from "@/types/character-arc";
import { useAuthStore } from "@/store/auth-store";

const inputCls =
  "mt-0.5 w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-violet-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelCls = "text-xs font-medium text-neutral-600 dark:text-neutral-400";
const textareaCls = `${inputCls} min-h-[72px] resize-y`;

/** 主档退场字段已填，或正文里出现典型死亡表述时，视为已故并素色展示页面 */
const DEATH_SIGNAL_RE =
  /死亡|身亡|遇难|阵亡|牺牲|身死|毙命|炸死|过世|殒命|离世|殉|遇害|毙了|气绝|断气|不幸身亡|当场身亡|爆炸死亡|已死|死了/;

function collectTextForDeathSignal(
  d: CharacterArcMaster,
  tl: CharacterCastTimelineRow[],
): string {
  const custom = [...(d.customConstants ?? []), ...(d.customVariables ?? [])]
    .map((r) => `${r.key}\n${r.value}`)
    .join("\n");
  const fromCast = tl
    .flatMap((t) => [
      t.character.presence,
      t.character.notes,
      t.character.appearance,
      t.character.personality,
    ])
    .filter(Boolean)
    .join("\n");
  return [d.outcome, d.notes, custom, fromCast].filter(Boolean).join("\n");
}

function isCharacterDeceased(d: CharacterArcMaster | null, tl: CharacterCastTimelineRow[]): boolean {
  if (!d) return false;
  if (d.deathChapterId?.trim()) return true;
  if (
    d.deathChapterIndex != null &&
    Number.isFinite(d.deathChapterIndex) &&
    d.deathChapterIndex >= 1
  ) {
    return true;
  }
  return DEATH_SIGNAL_RE.test(collectTextForDeathSignal(d, tl));
}

type Props = { novelId: string; stableId: string };

type ApiGet = {
  master: CharacterArcMaster | null;
  timeline: CharacterCastTimelineRow[];
  inferredFirst: { chapterId: string; chapterIndex: number } | null;
  displayFromCast: { name: string; namePinyin: string; stableId: string } | null;
};

function normalizeMaster(m: CharacterArcMaster): CharacterArcMaster {
  return {
    ...m,
    customConstants: m.customConstants ?? [],
    customVariables: m.customVariables ?? [],
  };
}

function sanitizeCustomRows(rows: CharacterArcCustomRow[] | undefined): CharacterArcCustomRow[] {
  return (rows ?? [])
    .filter((r) => r.key.trim().length > 0)
    .map((r) => ({
      key: r.key.trim().slice(0, 64),
      value: r.value.slice(0, 4000),
    }))
    .slice(0, 40);
}

function emptyMaster(
  novelId: string,
  stableKey: string,
  hint: ApiGet["displayFromCast"],
  inferred: ApiGet["inferredFirst"],
): CharacterArcMaster {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    novelId,
    stableId: (hint?.stableId ?? stableKey).trim() || stableKey,
    name: hint?.name ?? "人物",
    namePinyin: (hint?.namePinyin ?? "renwu").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 48) || "renwu",
    firstSeenChapterId: inferred?.chapterId ?? null,
    firstSeenChapterIndex: inferred?.chapterIndex ?? null,
    deathChapterId: null,
    deathChapterIndex: null,
    outcome: "",
    notes: "",
    updatedAt: now,
    gender: "",
    ageConst: "",
    birthBackground: "",
    appearanceConst: "",
    personalityVar: "",
    skills: "",
    luck: "",
    combatPower: "",
    locationVar: "",
    customConstants: [],
    customVariables: [],
  };
}

function CustomRowsBlock({
  title,
  hint,
  rows,
  onChange,
}: {
  title: string;
  hint: string;
  rows: CharacterArcCustomRow[];
  onChange: (next: CharacterArcCustomRow[]) => void;
}) {
  const add = () => onChange([...rows, { key: "", value: "" }]);
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const patch = (i: number, patchRow: Partial<CharacterArcCustomRow>) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patchRow } : r)));
  };

  return (
    <div className="mt-4 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
      <p className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">{title}</p>
      <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{hint}</p>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start">
          <input
            className={`${inputCls} sm:w-36 shrink-0 font-medium`}
            placeholder="字段名"
            maxLength={64}
            value={row.key}
            onChange={(e) => patch(i, { key: e.target.value })}
          />
          <textarea
            className={`${textareaCls} min-h-[52px] flex-1 sm:min-h-[56px]`}
            placeholder="内容"
            maxLength={4000}
            value={row.value}
            onChange={(e) => patch(i, { value: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            删除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-violet-400/60 px-3 py-1.5 text-[11px] font-medium text-violet-800 hover:bg-violet-50 dark:text-violet-200 dark:hover:bg-violet-950/40"
      >
        + 增加一行
      </button>
    </div>
  );
}

export function CharacterArcPage({ novelId, stableId }: Props) {
  const authorId = useAuthStore((s) => s.authorId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<CharacterCastTimelineRow[]>([]);
  const [draft, setDraft] = useState<CharacterArcMaster | null>(null);
  const [novelTitle, setNovelTitle] = useState<string | null>(null);
  const [chapterTitles, setChapterTitles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const stableKey = useMemo(() => stableId.trim(), [stableId]);

  const load = useCallback(async () => {
    if (!authorId || !stableKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({
        authorId,
        novelId,
        stableId: stableKey,
      });
      const r = await fetch(`/api/v1/character-arc?${sp.toString()}`, {
        headers: { "x-wallet-address": authorId },
        cache: "no-store",
      });
      const data = (await r.json()) as ApiGet & { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setTimeline(data.timeline ?? []);
      if (data.master) {
        setDraft(normalizeMaster(data.master));
      } else {
        setDraft(emptyMaster(novelId, stableKey, data.displayFromCast, data.inferredFirst));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setDraft(null);
      setTimeline([]);
    } finally {
      setLoading(false);
    }
  }, [authorId, novelId, stableKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!authorId) return;
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
        const j = (await r.json()) as { novel?: { title?: string } };
        const t = j.novel?.title;
        if (typeof t === "string" && t.trim()) setNovelTitle(t.trim());
      } catch {
        /* ignore */
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  useEffect(() => {
    if (!authorId) return;
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
        if (!r.ok) return;
        const j = (await r.json()) as { nodes: PlotNode[] | null };
        const nodes = j.nodes ?? [];
        const map: Record<string, string> = {};
        for (const n of nodes) {
          if (n.kind === "chapter" && typeof n.id === "string" && typeof n.title === "string") {
            map[n.id] = n.title;
          }
        }
        setChapterTitles(map);
      } catch {
        /* ignore */
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const handleSave = useCallback(async () => {
    if (!authorId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const payload: CharacterArcMaster = {
        ...draft,
        novelId,
        stableId: draft.stableId.trim(),
        name: draft.name.trim(),
        namePinyin: draft.namePinyin.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 48),
        firstSeenChapterIndex:
          draft.firstSeenChapterIndex != null &&
          Number.isFinite(draft.firstSeenChapterIndex) &&
          draft.firstSeenChapterIndex >= 1
            ? Math.floor(draft.firstSeenChapterIndex)
            : null,
        deathChapterIndex:
          draft.deathChapterIndex != null &&
          Number.isFinite(draft.deathChapterIndex) &&
          draft.deathChapterIndex >= 1
            ? Math.floor(draft.deathChapterIndex)
            : null,
        firstSeenChapterId: draft.firstSeenChapterId?.trim() || null,
        deathChapterId: draft.deathChapterId?.trim() || null,
        customConstants: sanitizeCustomRows(draft.customConstants),
        customVariables: sanitizeCustomRows(draft.customVariables),
        updatedAt: new Date().toISOString(),
      };

      const r = await fetch("/api/v1/character-arc", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({ authorId, payload }),
      });
      const data = (await r.json()) as { ok?: boolean; master?: CharacterArcMaster; error?: string; code?: string };
      if (!r.ok) {
        if (r.status === 403 && data.code === "subscription_required") {
          throw new Error(data.error ?? "需要付费会员订阅后方可保存。");
        }
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      if (data.master) setDraft(normalizeMaster(data.master));
      window.alert("已保存人物主档");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [authorId, draft, novelId]);

  const displayName = draft?.name ?? stableKey;

  const deceased = useMemo(
    () => isCharacterDeceased(draft, timeline),
    [draft, timeline],
  );

  return (
    <div
      className={[
        "flex min-h-[100dvh] flex-col transition-[background-color,filter,color] duration-500",
        deceased
          ? "bg-neutral-400/85 text-neutral-600 saturate-[0.55] dark:bg-neutral-950 dark:text-neutral-500 dark:saturate-[0.5]"
          : "bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100",
      ].join(" ")}
    >
      {deceased ? (
        <div
          role="status"
          className="shrink-0 border-b border-neutral-500/40 bg-neutral-500/25 px-4 py-2 text-center text-xs text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-400"
        >
          已检测到退场/死亡相关描述（主档退场信息或各章 JSON 文案），本页以淡灰素色展示。
        </div>
      ) : null}
      <header
        className={[
          "shrink-0 border-b px-4 py-3",
          deceased
            ? "border-neutral-500/30 bg-neutral-500/20 dark:border-neutral-700 dark:bg-neutral-900/90"
            : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">
              人物跨章档案
            </p>
            <h1
              className={[
                "mt-0.5 truncate text-lg font-semibold",
                deceased ? "text-neutral-700 dark:text-neutral-400" : "text-neutral-900 dark:text-neutral-50",
              ].join(" ")}
            >
              {displayName}
            </h1>
            <p
              className={[
                "mt-0.5 truncate text-xs",
                deceased ? "text-neutral-600 dark:text-neutral-500" : "text-neutral-500",
              ].join(" ")}
            >
              {novelTitle ?? novelId} · stableId{" "}
              <span className="font-mono text-[10px]">{stableKey}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WalletConnect />
            <Link
              href={`/editor/${encodeURIComponent(novelId)}/chapter-cast`}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs font-medium",
                deceased
                  ? "border-neutral-500/50 bg-neutral-300/60 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  : "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100",
              ].join(" ")}
            >
              人物大开本
            </Link>
            <Link
              href={`/editor/${encodeURIComponent(novelId)}`}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs font-medium",
                deceased
                  ? "border-neutral-500/50 bg-neutral-300/60 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  : "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100",
              ].join(" ")}
            >
              主编台
            </Link>
          </div>
        </div>
      </header>

      <main
        className={[
          "mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6",
          deceased ? "opacity-95 grayscale-[0.35]" : "",
        ].join(" ")}
      >
        {!authorId ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            连接钱包后可加载跨章档案与各章 JSON 快照。
          </p>
        ) : null}

        {loading ? <p className="text-sm text-neutral-500">加载中…</p> : null}
        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {!loading && authorId && draft ? (
          <>
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">人物设定</h2>
                  <p className="mt-1 max-w-3xl text-[11px] text-neutral-500 dark:text-neutral-400">
                    左侧为<strong>常量</strong>（姓名、性别、年龄定设、出身、长相等）；右侧为<strong>变量</strong>（性格、技能、幸运、武力、位置等）。两侧均可<strong>自增字段行</strong>，保存后主档 JSON 一并写入。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="rounded-lg border border-violet-500/50 bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                >
                  {saving ? "保存中…" : "保存主档"}
                </button>
              </div>

              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                    常量（很少改动）
                  </h3>
                  <div className="mt-3 space-y-3">
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
                      <label className={labelCls}>性别</label>
                      <input
                        className={inputCls}
                        value={draft.gender ?? ""}
                        maxLength={32}
                        onChange={(e) => setDraft((d) => (d ? { ...d, gender: e.target.value } : d))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>年龄 / 生年等</label>
                      <input
                        className={inputCls}
                        value={draft.ageConst ?? ""}
                        maxLength={128}
                        onChange={(e) => setDraft((d) => (d ? { ...d, ageConst: e.target.value } : d))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>出生 / 背景</label>
                      <textarea
                        className={textareaCls}
                        value={draft.birthBackground ?? ""}
                        maxLength={8000}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, birthBackground: e.target.value } : d))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>长相</label>
                      <textarea
                        className={textareaCls}
                        value={draft.appearanceConst ?? ""}
                        maxLength={8000}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, appearanceConst: e.target.value } : d))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>拼音 slug（用于文件名规则）</label>
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
                      <label className={labelCls}>stableId（只读）</label>
                      <input
                        className={`${inputCls} font-mono text-xs opacity-80`}
                        readOnly
                        value={draft.stableId}
                      />
                    </div>
                  </div>
                  <CustomRowsBlock
                    title="自定义常量项"
                    hint="如：血型、籍贯、种族… 字段名必填才会保存该行。"
                    rows={draft.customConstants ?? []}
                    onChange={(next) => setDraft((d) => (d ? { ...d, customConstants: next } : d))}
                  />
                </div>

                <div className="rounded-lg border border-cyan-200/80 bg-cyan-50/40 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-900 dark:text-cyan-200">
                    变量（随剧情更新）
                  </h3>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className={labelCls}>性格</label>
                      <textarea
                        className={textareaCls}
                        value={draft.personalityVar ?? ""}
                        maxLength={8000}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, personalityVar: e.target.value } : d))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>技能</label>
                      <textarea
                        className={textareaCls}
                        value={draft.skills ?? ""}
                        maxLength={8000}
                        onChange={(e) => setDraft((d) => (d ? { ...d, skills: e.target.value } : d))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>幸运值</label>
                      <input
                        className={inputCls}
                        value={draft.luck ?? ""}
                        maxLength={256}
                        onChange={(e) => setDraft((d) => (d ? { ...d, luck: e.target.value } : d))}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>武力值</label>
                      <input
                        className={inputCls}
                        value={draft.combatPower ?? ""}
                        maxLength={256}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, combatPower: e.target.value } : d))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>所处位置</label>
                      <textarea
                        className={`${textareaCls} min-h-[56px]`}
                        value={draft.locationVar ?? ""}
                        maxLength={8000}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, locationVar: e.target.value } : d))
                        }
                      />
                    </div>
                  </div>
                  <CustomRowsBlock
                    title="自定义变量项"
                    hint="如：精神状态、关系网、持有道具… 字段名必填才会保存该行。"
                    rows={draft.customVariables ?? []}
                    onChange={(next) => setDraft((d) => (d ? { ...d, customVariables: next } : d))}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">剧情线</h2>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                首次登场、退场与结局说明；与各章抽取 JSON 独立。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={labelCls}>首次登场（章 id）</label>
                  <input
                    className={`${inputCls} font-mono text-xs`}
                    value={draft.firstSeenChapterId ?? ""}
                    placeholder="plot-chapter-…"
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              firstSeenChapterId: e.target.value.trim() || null,
                            }
                          : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>首次登场（章节序号）</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={draft.firstSeenChapterIndex ?? ""}
                    placeholder="1"
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              firstSeenChapterIndex: v ? parseInt(v, 10) : null,
                            }
                          : d,
                      );
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls}>退场 / 死亡章 id</label>
                  <input
                    className={`${inputCls} font-mono text-xs`}
                    value={draft.deathChapterId ?? ""}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              deathChapterId: e.target.value.trim() || null,
                            }
                          : d,
                      )
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>退场章节序号</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={draft.deathChapterIndex ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              deathChapterIndex: v ? parseInt(v, 10) : null,
                            }
                          : d,
                      );
                    }}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className={labelCls}>结局 / 长线说明</label>
                  <textarea
                    className={`${inputCls} min-h-[100px] resize-y`}
                    value={draft.outcome}
                    maxLength={20_000}
                    onChange={(e) => setDraft((d) => (d ? { ...d, outcome: e.target.value } : d))}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className={labelCls}>主档备注</label>
                  <textarea
                    className={`${inputCls} min-h-[64px] resize-y`}
                    value={draft.notes}
                    maxLength={10_000}
                    onChange={(e) => setDraft((d) => (d ? { ...d, notes: e.target.value } : d))}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="mt-4 rounded-lg border border-violet-500/50 bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40 lg:hidden"
              >
                {saving ? "保存中…" : "保存主档"}
              </button>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                各章快照（最新抽取版本）
              </h2>
              {timeline.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">
                  暂无匹配各章 JSON。请确认 stableId 与各章人物 JSON 一致。
                </p>
              ) : (
                <ol className="mt-4 space-y-4 border-l-2 border-violet-200 pl-4 dark:border-violet-900">
                  {timeline.map((row) => (
                    <li key={`${row.chapterId}-${row.fileName}`} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-violet-500 ring-4 ring-white dark:ring-neutral-900" />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          第 {row.chapterIndex} 章
                          {chapterTitles[row.chapterId] ? (
                            <span className="font-normal text-neutral-600 dark:text-neutral-400">
                              {" "}
                              · {chapterTitles[row.chapterId]}
                            </span>
                          ) : null}
                        </p>
                        <Link
                          href={`/editor/${encodeURIComponent(novelId)}/chapter-cast?chapterId=${encodeURIComponent(row.chapterId)}`}
                          className="text-[11px] font-medium text-violet-600 hover:underline dark:text-violet-400"
                        >
                          在大开本中打开
                        </Link>
                      </div>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {row.version} / <span className="font-mono">{row.fileName}</span>
                      </p>
                      {row.character.presence ? (
                        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                          {row.character.presence}
                        </p>
                      ) : null}
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-violet-600 dark:text-violet-400">
                          本章完整字段
                        </summary>
                        <dl className="mt-2 space-y-1 text-neutral-600 dark:text-neutral-400">
                          {row.character.age ? (
                            <>
                              <dt className="font-medium text-neutral-500">年龄</dt>
                              <dd>{row.character.age}</dd>
                            </>
                          ) : null}
                          {row.character.appearance ? (
                            <>
                              <dt className="mt-2 font-medium text-neutral-500">外貌</dt>
                              <dd className="whitespace-pre-wrap">{row.character.appearance}</dd>
                            </>
                          ) : null}
                          {row.character.personality ? (
                            <>
                              <dt className="mt-2 font-medium text-neutral-500">性格</dt>
                              <dd className="whitespace-pre-wrap">{row.character.personality}</dd>
                            </>
                          ) : null}
                          {row.character.location ? (
                            <>
                              <dt className="mt-2 font-medium text-neutral-500">地点</dt>
                              <dd>{row.character.location}</dd>
                            </>
                          ) : null}
                          {row.character.notes ? (
                            <>
                              <dt className="mt-2 font-medium text-neutral-500">备注</dt>
                              <dd className="whitespace-pre-wrap">{row.character.notes}</dd>
                            </>
                          ) : null}
                        </dl>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
