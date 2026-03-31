"use client";

import type { Persona } from "@chenchen/shared/types";
import { ChevronRight, Plus, Trash2, UserCircle2 } from "lucide-react";

type Props = {
  personas: Persona[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  walletConnected: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
};

export function PersonaSidebar({
  personas,
  selectedId,
  onSelect,
  walletConnected,
  onAdd,
  onDelete,
}: Props) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          角色设定
        </p>
        <p className="mt-1 text-sm text-neutral-800 dark:text-neutral-100">
          点击卡片在右侧展开立场 · 动机 · 冲突
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
      <ul className="flex-1 overflow-y-auto p-2">
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
                      <span className="block text-xs text-neutral-500">
                        {p.roleLabel}
                      </span>
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
                  title={
                    walletConnected ? "删除此角色" : "请先连接钱包"
                  }
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
    </aside>
  );
}
