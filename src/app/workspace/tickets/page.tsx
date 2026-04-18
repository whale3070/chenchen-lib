"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { WalletConnect } from "@/components/wallet-connect";
import { useWeb3Auth } from "@/hooks/use-web3-auth";
import { useAuthStore } from "@/store/auth-store";

type TicketItem = {
  id: string;
  createdBy: string;
  title: string;
  content: string;
  imageUrls?: string[];
  status: "open" | "done" | "closed" | "ignored";
  createdAt: string;
  updatedAt: string;
  closedBy: string | null;
  adminNote: string;
};

const TICKET_STATUS_LABELS_ZH: Record<TicketItem["status"], string> = {
  open: "待处理",
  done: "已完成",
  closed: "已关闭",
  ignored: "已忽略",
};

function formatModified(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function WorkspaceTicketsPage() {
  const { isConnectPending } = useWeb3Auth();
  const authorId = useAuthStore((s) => s.authorId);
  const [items, setItems] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | TicketItem["status"]>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const loadTickets = useCallback(async () => {
    if (!authorId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (mineOnly) params.set("mine", "1");
      if (statusFilter !== "all") params.set("status", statusFilter);
      const query = params.toString();
      const res = await fetch(`/api/v1/tickets${query ? `?${query}` : ""}`, {
        headers: { "x-wallet-address": authorId },
      });
      const data = (await res.json()) as {
        items?: TicketItem[];
        isAdmin?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载工单失败");
      setItems(data.items ?? []);
      setIsAdmin(Boolean(data.isAdmin));
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "加载工单失败");
    } finally {
      setLoading(false);
    }
  }, [authorId, mineOnly, statusFilter]);

  useEffect(() => {
    if (!authorId) {
      setItems([]);
      setIsAdmin(false);
      return;
    }
    void loadTickets();
  }, [authorId, loadTickets]);

  useEffect(() => {
    if (!isAdmin && mineOnly === false) {
      setMineOnly(true);
    }
  }, [isAdmin, mineOnly]);

  const handleUpdateStatus = useCallback(
    async (ticketId: string, status: TicketItem["status"]) => {
      if (!authorId || !isAdmin || updatingId) return;
      setUpdatingId(ticketId);
      setError(null);
      try {
        const res = await fetch(`/api/v1/tickets/${encodeURIComponent(ticketId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({
            status,
            adminNote: (adminNotes[ticketId] ?? "").trim() || undefined,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "更新工单状态失败");
        await loadTickets();
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新工单状态失败");
      } finally {
        setUpdatingId(null);
      }
    },
    [authorId, adminNotes, isAdmin, loadTickets, updatingId],
  );

  const statusOptions = useMemo(
    () => [
      { value: "all" as const, label: "全部状态" },
      { value: "open" as const, label: TICKET_STATUS_LABELS_ZH.open },
      { value: "done" as const, label: TICKET_STATUS_LABELS_ZH.done },
      { value: "closed" as const, label: TICKET_STATUS_LABELS_ZH.closed },
      { value: "ignored" as const, label: TICKET_STATUS_LABELS_ZH.ignored },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-[#050810] px-6 py-10 text-zinc-200">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-cyan-300">全部工单</h1>
          <div className="flex items-center gap-2">
            <WalletConnect />
            <Link
              href="/workspace"
              className="rounded-md border border-[#324866] px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#0d1625]"
            >
              返回工作台
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-zinc-400">
              状态
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | TicketItem["status"])
                }
                className="ml-2 rounded border border-[#324866] bg-[#0d1625] px-2 py-1 text-xs text-zinc-200"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)}
                disabled={!isAdmin}
              />
              仅看我的工单
            </label>
            <button
              type="button"
              onClick={() => void loadTickets()}
              disabled={loading || !authorId}
              className="rounded border border-[#324866] px-2.5 py-1 text-xs text-zinc-300 hover:bg-[#0d1625] disabled:opacity-50"
            >
              {loading ? "刷新中…" : "刷新"}
            </button>
          </div>
        </div>

        {!authorId ? (
          <p className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4 text-sm text-zinc-400">
            请先使用邮箱登录或连接钱包后再查看工单。
            {isConnectPending ? "（连接中…）" : ""}
          </p>
        ) : error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : loading ? (
          <p className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4 text-sm text-zinc-400">
            加载中…
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4 text-sm text-zinc-400">
            暂无工单
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((ticket) => (
              <li
                key={ticket.id}
                className="rounded-xl border border-[#2a3b57] bg-[#121a29] p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-100">{ticket.title}</p>
                  <span className="rounded-full border border-cyan-400/40 px-2 py-0.5 text-[11px] text-cyan-300">
                    {TICKET_STATUS_LABELS_ZH[ticket.status] ?? ticket.status}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
                  {ticket.content}
                </p>
                {ticket.imageUrls && ticket.imageUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ticket.imageUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block"
                      >
                        <img
                          src={url}
                          alt="工单截图"
                          className="h-20 w-20 rounded border border-[#324866] object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] text-zinc-500">
                  提交人：{ticket.createdBy} · 创建：{formatModified(ticket.createdAt)} · 更新：
                  {formatModified(ticket.updatedAt)}
                </p>
                {ticket.adminNote ? (
                  <p className="mt-2 whitespace-pre-wrap break-words rounded border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                    管理员备注：{ticket.adminNote}
                  </p>
                ) : null}
                {isAdmin ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={adminNotes[ticket.id] ?? ""}
                      onChange={(e) =>
                        setAdminNotes((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                      }
                      rows={2}
                      className="w-full resize-y rounded border border-[#324866] bg-[#0d1625] px-2 py-1 text-xs text-zinc-200"
                      placeholder="管理员备注（可选）"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(ticket.id, "done")}
                        disabled={updatingId === ticket.id}
                        className="rounded border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        标记已完成
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(ticket.id, "closed")}
                        disabled={updatingId === ticket.id}
                        className="rounded border border-zinc-500/40 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-500/10 disabled:opacity-50"
                      >
                        标记已关闭
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(ticket.id, "ignored")}
                        disabled={updatingId === ticket.id}
                        className="rounded border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        标记已忽略
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
