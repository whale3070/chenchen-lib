"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Crosshair, GripVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  appendOutlineChildFlat,
  flatToOutlineTree,
  plotKindLabel,
  removeSectionAndPromoteChildrenFlat,
  removeVolumeAndPromoteChildrenFlat,
  reorderOutlineFlat,
  resolveParentForNewChapter,
  type PlotOutlineNode,
} from "@/lib/plot-outline";
import type { PlotNode } from "@chenchen/shared/types";

export type OutlineSidebarProps = {
  nodes: PlotNode[];
  onNodesChange: (nodes: PlotNode[]) => void;
  /** 持久化到服务端（拖拽后立即调用；文案修改防抖后调用） */
  onUpdateStructure: (nodes: PlotNode[]) => void;
  /** 点击节点在稿面中定位 */
  onNodeSeek: (range: { from: number; to: number }) => void;
  /** 章节节点：切换到对应章节 */
  onChapterSelect?: (chapterId: string) => void;
  /** 当前激活章节（用于同步高亮） */
  activeChapterId?: string | null;
  /** 发布模块：大纲区顶部展示「草稿/已公开/付费中」 */
  publishStatusLabel?: string | null;
  /** 发布模块：撤回至草稿（仅免费公开等可撤状态由父组件控制） */
  onWithdrawPublish?: () => void;
  withdrawPublishDisabled?: boolean;
  /** 按章节发布：已发布章节 ID 列表 */
  publishedChapterIds?: string[];
  /** 已发布但与上次发布快照不一致的章节（正文已改，待再次发布同步） */
  publishedChapterDirtyIds?: Set<string>;
  /** 按章节发布：切换章节发布状态 */
  onToggleChapterPublish?: (chapterId: string, publish: boolean) => Promise<void> | void;
  /** 按章节发布：是否允许操作（例如未公开时禁用） */
  chapterPublishDisabled?: boolean;
  /** 一键发布全部章节 */
  onPublishAllChapters?: () => Promise<void> | void;
  publishAllChaptersDisabled?: boolean;
  /** 删除章节（删除当前选中章节） */
  onDeleteChapter?: (chapterId: string) => void;
};

const EDIT_COMMIT_MS = 650;
const CHAPTER_CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const CHAPTER_CN_TO_NUM: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function chapterNoLabel(n: number) {
  if (n >= 1 && n <= 10) return CHAPTER_CN[n];
  return String(n);
}

function chapterTitleByNo(n: number) {
  return `第${chapterNoLabel(n)}章`;
}

function parseChapterNoFromTitle(title: string): number | null {
  const t = title.trim();
  const m = t.match(/^第([一二三四五六七八九十]|\d+)章/);
  if (!m) return null;
  const token = m[1];
  if (/^\d+$/.test(token)) {
    return Number.parseInt(token, 10);
  }
  return CHAPTER_CN_TO_NUM[token] ?? null;
}

function makeNodeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTag(raw: string): string {
  return raw.replace(/^#+/, "").trim();
}

function formatTagDisplay(t: string): string {
  const s = t.trim();
  return s.startsWith("#") ? s : `#${s}`;
}

function SortableOutlineCard({
  node,
  depth,
  activeOutlineId,
  onActivate,
  onSelect,
  onPatch,
  onAddTag,
  onRemoveTag,
  publishedChapterIds,
  publishedChapterDirtyIds,
  onToggleChapterPublish,
  chapterPublishDisabled,
}: {
  node: PlotOutlineNode;
  depth: number;
  activeOutlineId: string | null;
  onActivate: (n: PlotOutlineNode) => void;
  onSelect: (n: PlotOutlineNode) => void;
  onPatch: (id: string, patch: Partial<PlotNode>) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  publishedChapterIds: Set<string>;
  publishedChapterDirtyIds: Set<string>;
  onToggleChapterPublish?: (chapterId: string, publish: boolean) => Promise<void> | void;
  chapterPublishDisabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const [tagInput, setTagInput] = useState("");
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const onTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = normalizeTag(tagInput);
    if (!t) return;
    onAddTag(node.id, t);
    setTagInput("");
  };

  const active = node.id === activeOutlineId;
  const isChapter = node.kind === "chapter";
  const isPublished = isChapter && publishedChapterIds.has(node.id);
  const isPublishDirty =
    isPublished && publishedChapterDirtyIds.has(node.id);
  const [toggling, setToggling] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      <div
        data-outline-id={node.id}
        onClick={() => onSelect(node)}
        className={[
          "mb-2 rounded-lg border bg-white p-2.5 shadow-sm dark:bg-neutral-900",
          active
            ? "border-violet-400 ring-1 ring-violet-300/60 dark:border-violet-600 dark:ring-violet-700/50"
            : "border-neutral-200 dark:border-neutral-700",
        ].join(" ")}
      >
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 active:cursor-grabbing dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="拖动排序"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 shrink-0" />
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {plotKindLabel(node.kind)}
              </span>
              <div className="flex items-center gap-1">
                {isChapter ? (
                  <>
                    <span
                      className={
                        !isPublished
                          ? "rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                          : isPublishDirty
                            ? "rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-300"
                            : "rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {!isPublished
                        ? "未发布"
                        : isPublishDirty
                          ? "更新修改"
                          : "已发布"}
                    </span>
                    {onToggleChapterPublish ? (
                      <button
                        type="button"
                        disabled={Boolean(chapterPublishDisabled) || toggling}
                        onClick={async () => {
                          setToggling(true);
                          try {
                            await onToggleChapterPublish(node.id, !isPublished);
                          } finally {
                            setToggling(false);
                          }
                        }}
                        className="rounded border border-cyan-500/40 px-1.5 py-0.5 text-[10px] text-cyan-700 hover:bg-cyan-50 disabled:opacity-40 dark:text-cyan-300 dark:hover:bg-cyan-950/40"
                        title={
                          chapterPublishDisabled
                            ? "请先将整本设置为公开后再按章节发布"
                            : isPublished
                              ? "撤回本章发布"
                              : "发布本章"
                        }
                      >
                        {toggling ? "处理中…" : isPublished ? "撤回" : "发布"}
                      </button>
                    ) : null}
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => onActivate(node)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/50"
                  title="在稿面中滚动到对应位置"
                >
                  <Crosshair className="h-3 w-3" aria-hidden />
                  定位
                </button>
              </div>
            </div>
            <input
              type="text"
              value={node.title}
              onChange={(e) => onPatch(node.id, { title: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-transparent bg-transparent text-sm font-medium text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-200 focus:border-violet-400 focus:outline-none dark:text-neutral-50 dark:hover:border-neutral-600 dark:focus:border-violet-500"
              placeholder="标题"
            />
            <textarea
              value={node.summary ?? ""}
              onChange={(e) => onPatch(node.id, { summary: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              rows={2}
              className="w-full resize-none rounded border border-transparent bg-transparent text-xs text-neutral-600 placeholder:text-neutral-400 hover:border-neutral-200 focus:border-violet-400 focus:outline-none dark:text-neutral-300 dark:hover:border-neutral-600"
              placeholder="简述"
            />
            <div className="flex flex-wrap gap-1">
              {(node.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                >
                  {formatTagDisplay(t)}
                  <button
                    type="button"
                    onClick={() => onRemoveTag(node.id, t)}
                    className="ml-0.5 text-violet-600 hover:text-violet-900 dark:text-violet-300"
                    aria-label={`移除 ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-dashed border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 focus:border-violet-400 focus:outline-none dark:border-neutral-600 dark:text-neutral-400"
              placeholder="标签（回车添加，如 高潮）"
            />
          </div>
        </div>
      </div>
      {node.children.length > 0 ? (
        <OutlineBranch
          nodes={node.children}
          depth={depth + 1}
          activeOutlineId={activeOutlineId}
          onActivate={onActivate}
          onSelect={onSelect}
          onPatch={onPatch}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          publishedChapterIds={publishedChapterIds}
          publishedChapterDirtyIds={publishedChapterDirtyIds}
          onToggleChapterPublish={onToggleChapterPublish}
          chapterPublishDisabled={chapterPublishDisabled}
        />
      ) : null}
    </div>
  );
}

function OutlineBranch({
  nodes,
  depth,
  activeOutlineId,
  onActivate,
  onSelect,
  onPatch,
  onAddTag,
  onRemoveTag,
  publishedChapterIds,
  publishedChapterDirtyIds,
  onToggleChapterPublish,
  chapterPublishDisabled,
}: {
  nodes: PlotOutlineNode[];
  depth: number;
  activeOutlineId: string | null;
  onActivate: (n: PlotOutlineNode) => void;
  onSelect: (n: PlotOutlineNode) => void;
  onPatch: (id: string, patch: Partial<PlotNode>) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  publishedChapterIds: Set<string>;
  publishedChapterDirtyIds: Set<string>;
  onToggleChapterPublish?: (chapterId: string, publish: boolean) => Promise<void> | void;
  chapterPublishDisabled?: boolean;
}) {
  const ids = useMemo(() => nodes.map((n) => n.id), [nodes]);
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div style={{ paddingLeft: depth > 0 ? 10 : 0 }}>
        <ul className="list-none space-y-0 p-0">
          {nodes.map((node) => (
            <li key={node.id}>
              <SortableOutlineCard
                node={node}
                depth={depth}
                activeOutlineId={activeOutlineId}
                onActivate={onActivate}
                onSelect={onSelect}
                onPatch={onPatch}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
                publishedChapterIds={publishedChapterIds}
                publishedChapterDirtyIds={publishedChapterDirtyIds}
                onToggleChapterPublish={onToggleChapterPublish}
                chapterPublishDisabled={chapterPublishDisabled}
              />
            </li>
          ))}
        </ul>
      </div>
    </SortableContext>
  );
}

export function OutlineSidebar({
  nodes,
  onNodesChange,
  onUpdateStructure,
  onNodeSeek,
  onChapterSelect,
  activeChapterId,
  publishStatusLabel,
  onWithdrawPublish,
  withdrawPublishDisabled,
  publishedChapterIds,
  publishedChapterDirtyIds,
  onToggleChapterPublish,
  chapterPublishDisabled,
  onPublishAllChapters,
  publishAllChaptersDisabled,
  onDeleteChapter,
}: OutlineSidebarProps) {
  const roots = useMemo(() => flatToOutlineTree(nodes), [nodes]);
  const rootIds = useMemo(() => roots.map((r) => r.id), [roots]);
  const publishedChapterIdSet = useMemo(
    () => new Set(publishedChapterIds ?? []),
    [publishedChapterIds],
  );
  const publishedChapterDirtySet = useMemo(
    () => publishedChapterDirtyIds ?? new Set<string>(),
    [publishedChapterDirtyIds],
  );

  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  /** 显式点选的大纲节点优先，否则跟随当前章节（用于高亮与「新增节」等工具栏锚点） */
  const outlineToolbarAnchorId = useMemo(
    () => activeOutlineId ?? activeChapterId ?? null,
    [activeOutlineId, activeChapterId],
  );
  const outlineHighlightId = outlineToolbarAnchorId;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  const flushPersistTimer = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, []);

  const schedulePersist = useCallback(
    (next: PlotNode[]) => {
      flushPersistTimer();
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        onUpdateStructure(next);
      }, EDIT_COMMIT_MS);
    },
    [flushPersistTimer, onUpdateStructure],
  );

  useEffect(() => () => flushPersistTimer(), [flushPersistTimer]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const patchNode = useCallback(
    (id: string, patch: Partial<PlotNode>) => {
      const next = nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      onNodesChange(next);
      schedulePersist(next);
    },
    [nodes, onNodesChange, schedulePersist],
  );

  const addTag = useCallback(
    (id: string, tag: string) => {
      const t = normalizeTag(tag);
      if (!t) return;
      const next = nodes.map((n) => {
        if (n.id !== id) return n;
        const cur = n.tags ?? [];
        if (cur.includes(t)) return n;
        return { ...n, tags: [...cur, t] };
      });
      onNodesChange(next);
      schedulePersist(next);
    },
    [nodes, onNodesChange, schedulePersist],
  );

  const removeTag = useCallback(
    (id: string, tag: string) => {
      const next = nodes.map((n) => {
        if (n.id !== id) return n;
        const cur = n.tags ?? [];
        return { ...n, tags: cur.filter((x) => x !== tag) };
      });
      onNodesChange(next);
      schedulePersist(next);
    },
    [nodes, onNodesChange, schedulePersist],
  );

  const handleActivate = useCallback(
    (n: PlotOutlineNode) => {
      setActiveOutlineId(n.id);
      if (n.kind === "chapter") {
        onChapterSelect?.(n.id);
        return;
      }
      const r = n.range;
      if (r && typeof r.from === "number") {
        onNodeSeek({ from: r.from, to: r.to ?? r.from });
      }
    },
    [onChapterSelect, onNodeSeek],
  );

  const handleSelect = useCallback((n: PlotOutlineNode) => {
    setActiveOutlineId(n.id);
  }, []);

  useEffect(() => {
    if (!outlineHighlightId) return;
    const root = listContainerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-outline-id="${outlineHighlightId}"]`,
    );
    target?.scrollIntoView({ block: "nearest" });
  }, [outlineHighlightId, roots.length]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const next = reorderOutlineFlat(
        nodes,
        String(active.id),
        String(over.id),
      );
      if (!next) return;
      onNodesChange(next);
      flushPersistTimer();
      onUpdateStructure(next);
    },
    [nodes, onNodesChange, onUpdateStructure, flushPersistTimer],
  );

  const ensureVolumeAndAddChapter = useCallback(
    (chapterNo: number) => {
      const targetTitle = chapterTitleByNo(chapterNo);
      const hasSame = nodes.some(
        (n) => n.kind === "chapter" && n.title.trim() === targetTitle,
      );
      if (hasSame) {
        if (typeof window !== "undefined") {
          window.alert(`${targetTitle} 已存在`);
        }
        return;
      }

      const next = [...nodes];
      const { parentId, createVolumeIfMissing } = resolveParentForNewChapter(
        next,
        outlineToolbarAnchorId,
      );
      let parentForChapter = parentId;
      if (createVolumeIfMissing) {
        const vId = makeNodeId("plot-volume");
        next.push({
          id: vId,
          kind: "volume",
          title: "",
          summary: "",
        });
        parentForChapter = vId;
      }
      if (!parentForChapter) return;

      next.push({
        id: makeNodeId("plot-chapter"),
        kind: "chapter",
        title: targetTitle,
        summary: "",
        parentId: parentForChapter,
      });

      onNodesChange(next);
      flushPersistTimer();
      onUpdateStructure(next);
    },
    [
      nodes,
      outlineToolbarAnchorId,
      onNodesChange,
      onUpdateStructure,
      flushPersistTimer,
    ],
  );

  const addNextChapter = useCallback(() => {
    const chapterNos = nodes
      .filter((n) => n.kind === "chapter")
      .map((n) => parseChapterNoFromTitle(n.title))
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
    const maxNo = chapterNos.length > 0 ? Math.max(...chapterNos) : 0;
    ensureVolumeAndAddChapter(maxNo + 1);
  }, [nodes, ensureVolumeAndAddChapter]);

  const deleteSelectedOutlineBranch = useCallback(() => {
    const anchor = outlineToolbarAnchorId;
    if (!anchor) return;
    const sel = nodes.find((n) => n.id === anchor);
    if (!sel) return;

    if (sel.kind === "chapter") {
      if (!onDeleteChapter) return;
      onDeleteChapter(anchor);
      return;
    }

    if (sel.kind === "volume") {
      const label = sel.title?.trim() || "未命名卷";
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          `确定删除卷「${label}」吗？其下的章节与节将提升到上一层，不会删除正文。`,
        )
      ) {
        return;
      }
      const next = removeVolumeAndPromoteChildrenFlat(nodes, sel.id);
      if (!next) return;
      onNodesChange(next);
      flushPersistTimer();
      onUpdateStructure(next);
      setActiveOutlineId(null);
      return;
    }

    if (sel.kind === "section") {
      const label = sel.title?.trim() || "未命名节";
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          `确定删除节「${label}」吗？其下的子节点将提升到上一层，不会删除正文。`,
        )
      ) {
        return;
      }
      const next = removeSectionAndPromoteChildrenFlat(nodes, sel.id);
      if (!next) return;
      onNodesChange(next);
      flushPersistTimer();
      onUpdateStructure(next);
      setActiveOutlineId(null);
    }
  }, [
    outlineToolbarAnchorId,
    nodes,
    onNodesChange,
    onUpdateStructure,
    flushPersistTimer,
    onDeleteChapter,
  ]);

  const selectedOutlineNode = outlineToolbarAnchorId
    ? nodes.find((n) => n.id === outlineToolbarAnchorId)
    : undefined;
  const canDeleteOutlineSelection = Boolean(
    selectedOutlineNode &&
      (selectedOutlineNode.kind === "volume" ||
        selectedOutlineNode.kind === "section" ||
        (selectedOutlineNode.kind === "chapter" && onDeleteChapter)),
  );

  const addVolume = useCallback(() => {
    const id = makeNodeId("plot-volume");
    const next = appendOutlineChildFlat(nodes, null, {
      id,
      kind: "volume",
      title: "",
      summary: "",
    });
    if (!next) return;
    onNodesChange(next);
    flushPersistTimer();
    onUpdateStructure(next);
    setActiveOutlineId(id);
  }, [nodes, onNodesChange, onUpdateStructure, flushPersistTimer]);

  const addSectionUnderSelection = useCallback(() => {
    const next = [...nodes];
    const { parentId, createVolumeIfMissing } = resolveParentForNewChapter(
      next,
      outlineToolbarAnchorId,
    );
    let parentForSection = parentId;
    if (createVolumeIfMissing) {
      const vId = makeNodeId("plot-volume");
      next.push({
        id: vId,
        kind: "volume",
        title: "",
        summary: "",
      });
      parentForSection = vId;
    }
    if (!parentForSection) {
      if (typeof window !== "undefined") {
        window.alert("未能添加节：没有可挂载的卷或节。");
      }
      return;
    }
    const id = makeNodeId("plot-section");
    const appended = appendOutlineChildFlat(next, parentForSection, {
      id,
      kind: "section",
      title: "",
      summary: "",
    });
    if (!appended) {
      if (typeof window !== "undefined") {
        window.alert("未能添加节：找不到父节点。");
      }
      return;
    }
    onNodesChange(appended);
    flushPersistTimer();
    onUpdateStructure(appended);
    setActiveOutlineId(id);
  }, [
    nodes,
    outlineToolbarAnchorId,
    onNodesChange,
    onUpdateStructure,
    flushPersistTimer,
  ]);

  return (
    <aside className="flex w-[270px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/90 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            剧情大纲
          </p>
          <div className="flex items-center gap-1.5">
            {publishStatusLabel ? (
              <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
                发布状态 · {publishStatusLabel}
              </span>
            ) : null}
            {onPublishAllChapters ? (
              <button
                type="button"
                disabled={publishAllChaptersDisabled}
                onClick={() => void onPublishAllChapters()}
                className="rounded-full border border-emerald-500/45 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300"
                title={
                  publishAllChaptersDisabled
                    ? "请先公开作品并确保已有章节"
                    : "将当前所有章节标记为已发布"
                }
              >
                一键发布全部章节
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={addVolume}
            className="rounded border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            title="在根级末尾新增一卷"
          >
            + 新增卷
          </button>
          <button
            type="button"
            onClick={addNextChapter}
            className="rounded border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            title="新章挂在当前选中的卷或节下；选中章则挂在该章所属卷/节；否则挂在第一卷"
          >
            + 新增章节
          </button>
          <button
            type="button"
            onClick={addSectionUnderSelection}
            className="rounded border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            title="挂在当前章所属的卷/节下；若先点选了卷/节则挂在该节点下；无卷时会自动建卷"
          >
            + 新增节
          </button>
          <button
            type="button"
            disabled={!canDeleteOutlineSelection}
            onClick={deleteSelectedOutlineBranch}
            className="rounded border border-rose-300 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
            title="按当前选中类型删除：卷/节（子节点提升一层）或章节（含正文）"
          >
            删除卷/章/节
          </button>
        </div>
        {onWithdrawPublish ? (
          <button
            type="button"
            disabled={withdrawPublishDisabled}
            onClick={onWithdrawPublish}
            title={
              withdrawPublishDisabled
                ? "当前为付费连载或未公开，无法在此撤回"
                : "撤回公开，恢复为仅自己可见"
            }
            className="mt-2 text-[11px] text-amber-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-400"
          >
            撤回发布
          </button>
        ) : null}
      </div>
      <div ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {roots.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-neutral-500">
            暂无大纲节点
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={rootIds}
              strategy={verticalListSortingStrategy}
            >
              <ul className="list-none space-y-0 p-0">
                {roots.map((node) => (
                  <li key={node.id}>
                    <SortableOutlineCard
                      node={node}
                      depth={0}
                      activeOutlineId={outlineHighlightId}
                      onActivate={handleActivate}
                      onSelect={handleSelect}
                      onPatch={patchNode}
                      onAddTag={addTag}
                      onRemoveTag={removeTag}
                      publishedChapterIds={publishedChapterIdSet}
                      publishedChapterDirtyIds={publishedChapterDirtySet}
                      onToggleChapterPublish={onToggleChapterPublish}
                      chapterPublishDisabled={chapterPublishDisabled}
                    />
                  </li>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </aside>
  );
}
