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
  flatToOutlineTree,
  plotKindLabel,
  reorderOutlineFlat,
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
  /** 发布模块：大纲区顶部展示「草稿/已公开/付费中」 */
  publishStatusLabel?: string | null;
  /** 发布模块：撤回至草稿（仅免费公开等可撤状态由父组件控制） */
  onWithdrawPublish?: () => void;
  withdrawPublishDisabled?: boolean;
};

const EDIT_COMMIT_MS = 650;

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
  onPatch,
  onAddTag,
  onRemoveTag,
}: {
  node: PlotOutlineNode;
  depth: number;
  activeOutlineId: string | null;
  onActivate: (n: PlotOutlineNode) => void;
  onPatch: (id: string, patch: Partial<PlotNode>) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
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

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      <div
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
          onPatch={onPatch}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
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
  onPatch,
  onAddTag,
  onRemoveTag,
}: {
  nodes: PlotOutlineNode[];
  depth: number;
  activeOutlineId: string | null;
  onActivate: (n: PlotOutlineNode) => void;
  onPatch: (id: string, patch: Partial<PlotNode>) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
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
                onPatch={onPatch}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
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
  publishStatusLabel,
  onWithdrawPublish,
  withdrawPublishDisabled,
}: OutlineSidebarProps) {
  const roots = useMemo(() => flatToOutlineTree(nodes), [nodes]);
  const rootIds = useMemo(() => roots.map((r) => r.id), [roots]);

  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const r = n.range;
      if (r && typeof r.from === "number") {
        onNodeSeek({ from: r.from, to: r.to ?? r.from });
      }
    },
    [onNodeSeek],
  );

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

  return (
    <aside className="flex w-[270px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/90 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            剧情大纲
          </p>
          {publishStatusLabel ? (
            <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
              发布状态 · {publishStatusLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-neutral-700 dark:text-neutral-200">
          卷 / 章 / 节 · 拖拽同级排序 · 点击标题区定位稿面
        </p>
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
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                      activeOutlineId={activeOutlineId}
                      onActivate={handleActivate}
                      onPatch={patchNode}
                      onAddTag={addTag}
                      onRemoveTag={removeTag}
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
