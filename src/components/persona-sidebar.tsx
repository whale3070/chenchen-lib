"use client";

import type { Persona } from "@chenchen/shared/types";
import { ChevronRight, ExternalLink, Plus, Trash2, UserCircle2 } from "lucide-react";
import Link from "next/link";

import { ChapterCastPanel } from "@/components/chapter-cast-panel";

type Props = {
  personas: Persona[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  walletConnected: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  novelId: string;
  authorId: string | null;
  activeChapterId: string | null;
  chapterCastRefreshKey: number;
  onChapterCastExtract: () => void | Promise<void>;
  chapterCastExtracting: boolean;
  chapterCastExtractDisabled: boolean;
  onChapterCastExtractAll?: () => void | Promise<void>;
  chapterCastBatchExtracting?: boolean;
  chapterCastBatchProgress?: string;
  chapterCastExtractAllDisabled?: boolean;
};

export function PersonaSidebar({
  personas,
  selectedId,
  onSelect,
  walletConnected,
  onAdd,
  onDelete,
  novelId,
  authorId,
  activeChapterId,
  chapterCastRefreshKey,
  onChapterCastExtract,
  chapterCastExtracting,
  chapterCastExtractDisabled,
  onChapterCastExtractAll,
  chapterCastBatchExtracting = false,
  chapterCastBatchProgress = "",
  chapterCastExtractAllDisabled = false,
}: Props) {
  return (
    <aside className="flex min-h-0 w-[22rem] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 sm:w-96">
      <div className="shrink-0 border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          角色设定
        </p>
        <p className="mt-1 text-sm text-neutral-800 dark:text-neutral-100">
          点击列表项在右侧展开立场 · 动机 · 冲突
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAdd}
            title={
              walletConnected
                ? "新增角色并保存到当前钱包"
                : "可先本地新增；连接钱包后会自动同步到服务端"
            }
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            新增角色
          </button>
        </div>
        {!walletConnected ? (
          <p className="mt-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300/90">
            连接钱包后，新增/删除会写入服务端存档（按地址隔离）。
          </p>
        ) : null}
      </div>

      <ul className="max-h-[min(42vh,280px)] shrink-0 overflow-y-auto border-b border-neutral-200 p-2 dark:border-neutral-800">
        {personas.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-neutral-500">
            暂无角色，点击「新增角色」开始。
          </li>
        ) : null}
        {personas.map((p) => {
          const active = p.id === selectedId;
          return (
            <li key={p.id} className="group mb-1">
              <div
                className={[
                  "flex w-full items-stretch gap-0 overflow-hidden rounded-lg transition-colors",
                  active
                    ? "bg-white shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-700"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-900/80",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left"
                >
                  <UserCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-medium text-neutral-900 dark:text-neutral-50">
                      {p.name}
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </span>
                    {p.roleLabel && (
                      <span className="block text-xs text-neutral-500">{p.roleLabel}</span>
                    )}
                    {p.bio && (
                      <span className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                        {p.bio}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!walletConnected}
                  title={walletConnected ? "删除此角色" : "请先连接钱包"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  className="shrink-0 px-2 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  aria-label={`删除角色 ${p.name}`}
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex min-h-0 flex-1 flex-col border-t border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="shrink-0 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                人物信息
              </h2>
              <p className="mt-0.5 text-[10px] leading-snug text-neutral-500 dark:text-neutral-400">
                按章抽取的登场档案；下方竖向列表选择人物，数据存于{" "}
                <span className="font-mono">.data/chapter-casts/</span>
              </p>
            </div>
            {activeChapterId ? (
              <Link
                href={`/editor/${encodeURIComponent(novelId)}/chapter-cast?chapterId=${encodeURIComponent(activeChapterId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-violet-300/80 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-900 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100 dark:hover:bg-violet-900/60"
                title="在新标签页打开大开本编辑视图"
              >
                大开本
                <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
        <ChapterCastPanel
          authorId={authorId}
          novelId={novelId}
          chapterId={activeChapterId}
          refreshKey={chapterCastRefreshKey}
          onExtract={onChapterCastExtract}
          extractDisabled={chapterCastExtractDisabled}
          extractLoading={chapterCastExtracting}
          onExtractAll={onChapterCastExtractAll}
          extractAllDisabled={chapterCastExtractAllDisabled}
          extractAllLoading={chapterCastBatchExtracting}
          extractAllProgress={chapterCastBatchProgress}
        />
      </div>
    </aside>
  );
}
