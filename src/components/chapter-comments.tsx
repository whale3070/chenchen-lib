"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CommentItem = {
  id: string;
  articleId: string;
  chapterId: string;
  wallet: string;
  content: string;
  createdAt: string;
};

function shortWallet(addr: string) {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatRelativeTime(iso: string, uiLang: "zh" | "en"): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 10) return uiLang === "zh" ? "刚刚" : "just now";
  if (diffSec < 60) return uiLang === "zh" ? `${diffSec}秒前` : `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return uiLang === "zh" ? `${diffMin}分钟前` : `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return uiLang === "zh" ? `${diffHour}小时前` : `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return uiLang === "zh" ? `${diffDay}天前` : `${diffDay}d ago`;
}

export function ChapterComments(props: {
  articleId: string;
  chapterId: string;
  address?: string;
  isConnected: boolean;
  isConnectPending: boolean;
  requestConnect: () => Promise<void>;
  uiLang: "zh" | "en";
}) {
  const { articleId, chapterId, address, isConnected, isConnectPending, requestConnect, uiLang } =
    props;
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const knownIdsRef = useRef(new Set<string>());
  const sourceRef = useRef<EventSource | null>(null);

  const t = useMemo(
    () =>
      uiLang === "zh"
        ? {
            title: "章节评论",
            loading: "加载评论中...",
            empty: "暂无评论，来写第一条吧。",
            placeholder: "连接钱包后可评论，文明发言。",
            connect: "连接钱包",
            submit: "发送评论",
            sending: "发送中...",
            tooLong: "评论最多 800 字",
            needWallet: "请先连接钱包",
            delete: "删除",
            deleting: "删除中...",
          }
        : {
            title: "Chapter Comments",
            loading: "Loading comments...",
            empty: "No comments yet.",
            placeholder: "Connect wallet to comment.",
            connect: "Connect Wallet",
            submit: "Post",
            sending: "Posting...",
            tooLong: "Comment can be up to 800 chars",
            needWallet: "Please connect wallet first",
            delete: "Delete",
            deleting: "Deleting...",
          },
    [uiLang],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/v1/library/comments?articleId=${encodeURIComponent(articleId)}&chapterId=${encodeURIComponent(chapterId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { items?: CommentItem[]; error?: string };
      if (!res.ok) throw new Error(data.error || "加载评论失败");
      const next = Array.isArray(data.items) ? data.items : [];
      knownIdsRef.current = new Set(next.map((x) => x.id));
      setItems(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载评论失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [articleId, chapterId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    sourceRef.current?.close();
    const url =
      `/api/v1/library/comments/stream?articleId=${encodeURIComponent(articleId)}` +
      `&chapterId=${encodeURIComponent(chapterId)}`;
    const es = new EventSource(url);
    sourceRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string; comment?: CommentItem };
        if (data.type !== "comment" || !data.comment?.id) return;
        if (knownIdsRef.current.has(data.comment.id)) return;
        knownIdsRef.current.add(data.comment.id);
        setItems((prev) => [...prev, data.comment!]);
      } catch {
        // ignore malformed event
      }
    };
    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [articleId, chapterId]);

  const onSubmit = useCallback(async () => {
    const content = draft.trim();
    if (!isConnected || !address) {
      setError(t.needWallet);
      return;
    }
    if (!content) return;
    if (content.length > 800) {
      setError(t.tooLong);
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/v1/library/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({ articleId, chapterId, content }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "发送失败");
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  }, [address, articleId, chapterId, draft, isConnected, t.needWallet, t.tooLong]);

  const onDelete = useCallback(
    async (commentId: string) => {
      if (!isConnected || !address) {
        setError(t.needWallet);
        return;
      }
      setDeletingId(commentId);
      setError("");
      try {
        const res = await fetch("/api/v1/library/comments", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": address,
          },
          body: JSON.stringify({ articleId, chapterId, commentId }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "删除失败");
        knownIdsRef.current.delete(commentId);
        setItems((prev) => prev.filter((x) => x.id !== commentId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
      } finally {
        setDeletingId("");
      }
    },
    [address, articleId, chapterId, isConnected, t.needWallet],
  );

  return (
    <section className="mt-6 rounded-lg border border-[#1f3048] bg-[#0b1422] p-3">
      <h3 className="text-sm font-semibold text-cyan-300">{t.title}</h3>
      <div className="mt-3 space-y-2">
        {loading ? <p className="text-xs text-zinc-400">{t.loading}</p> : null}
        {!loading && items.length === 0 ? <p className="text-xs text-zinc-500">{t.empty}</p> : null}
        {items.map((c) => (
          <div key={c.id} className="rounded-md border border-[#24354a] bg-[#0a1220] p-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
              <span>{shortWallet(c.wallet)}</span>
              <div className="flex items-center gap-2">
                <span>{formatRelativeTime(c.createdAt, uiLang)}</span>
                {address && c.wallet === address.toLowerCase() ? (
                  <button
                    type="button"
                    disabled={deletingId === c.id}
                    onClick={() => void onDelete(c.id)}
                    className="rounded border border-rose-500/40 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-950/30 disabled:opacity-40"
                  >
                    {deletingId === c.id ? t.deleting : t.delete}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">{c.content}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <textarea
          value={draft}
          disabled={!isConnected || sending}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={800}
          rows={3}
          placeholder={t.placeholder}
          className="w-full rounded-md border border-zinc-700 bg-[#0a1220] px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">{draft.length}/800</span>
          {!isConnected ? (
            <button
              type="button"
              disabled={isConnectPending}
              onClick={() => void requestConnect()}
              className="rounded-md border border-cyan-500/50 px-2.5 py-1 text-xs text-cyan-300 hover:bg-cyan-950/30 disabled:opacity-40"
            >
              {t.connect}
            </button>
          ) : (
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void onSubmit()}
              className="rounded-md border border-emerald-500/50 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-40"
            >
              {sending ? t.sending : t.submit}
            </button>
          )}
        </div>
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      </div>
    </section>
  );
}
