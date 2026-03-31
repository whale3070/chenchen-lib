"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { WalletConnect } from "@/components/wallet-connect";
import { useWeb3Auth } from "@/hooks/use-web3-auth";
import {
  derivePublishDisplayStatus,
  publishStatusLabelZh,
  type NovelPublishRecord,
} from "@/lib/novel-publish";

type NovelListItem = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  lastModified: string;
};

type Tab = "novels" | "publish" | "settings";

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

export function AuthorDashboard() {
  const router = useRouter();
  const {
    address,
    isConnected,
    status,
    requestConnect,
    isConnectPending,
    connectors,
  } = useWeb3Auth();

  const [tab, setTab] = useState<Tab>("novels");
  const [novels, setNovels] = useState<NovelListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 发布模块：工作台聚合列表 */
  const [publishRows, setPublishRows] = useState<
    {
      novelId: string;
      novelTitle: string;
      record: NovelPublishRecord | null;
    }[]
  >([]);
  const [loadingPublish, setLoadingPublish] = useState(false);

  const connectBootRef = useRef(false);

  useEffect(() => {
    if (isConnected) return;
    if (
      status === "reconnecting" ||
      status === "connecting" ||
      isConnectPending
    )
      return;
    if (status !== "disconnected") return;
    if (connectors.length === 0) return;
    if (connectBootRef.current) return;
    connectBootRef.current = true;
    void requestConnect();
  }, [isConnected, status, isConnectPending, requestConnect, connectors.length]);

  useEffect(() => {
    if (isConnected) return;
    if (
      status === "reconnecting" ||
      status === "connecting" ||
      isConnectPending
    )
      return;
    const id = window.setTimeout(() => {
      router.replace("/");
    }, 30_000);
    return () => window.clearTimeout(id);
  }, [isConnected, status, isConnectPending, router]);

  const loadNovels = useCallback(async () => {
    if (!address) return;
    setLoadingList(true);
    try {
      const res = await fetch(
        `/api/v1/novels?authorId=${encodeURIComponent(address)}`,
        {
          headers: { "x-wallet-address": address },
        },
      );
      const data = (await res.json()) as {
        novels?: NovelListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setNovels(data.novels ?? []);
    } catch (e) {
      setNovels([]);
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  }, [address]);

  const loadPublishOverview = useCallback(async () => {
    if (!address) return;
    setLoadingPublish(true);
    try {
      const res = await fetch(
        `/api/v1/novel-publish?authorId=${encodeURIComponent(address)}`,
        { headers: { "x-wallet-address": address } },
      );
      const data = (await res.json()) as {
        items?: {
          novelId: string;
          novelTitle: string;
          record: NovelPublishRecord | null;
        }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setPublishRows(data.items ?? []);
    } catch (e) {
      setPublishRows([]);
      console.error(e);
    } finally {
      setLoadingPublish(false);
    }
  }, [address]);

  useEffect(() => {
    if (tab === "novels" && address) void loadNovels();
  }, [tab, address, loadNovels]);

  useEffect(() => {
    if (tab === "publish" && address) void loadPublishOverview();
  }, [tab, address, loadPublishOverview]);

  const openModal = () => {
    if (!address) return;
    setError(null);
    setTitle("");
    setDescription("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
  };

  const handleCreate = async () => {
    if (!address) return;
    const t = title.trim();
    if (!t) {
      setError("请填写小说标题");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/novels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({
          authorId: address,
          title: t,
          description: description.trim(),
        }),
      });
      const data = (await res.json()) as {
        novel?: NovelListItem;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      if (!data.novel?.id) throw new Error("未返回小说 ID");
      setModalOpen(false);
      router.push(`/editor/${encodeURIComponent(data.novel.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConnected || !address) {
    const busy =
      status === "reconnecting" ||
      status === "connecting" ||
      isConnectPending;

    if (busy) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[var(--background)] px-4 text-neutral-800 dark:text-neutral-100">
          <p className="text-sm font-medium">正在连接钱包…</p>
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            请在扩展或弹窗中完成授权
          </p>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] px-4 text-center text-neutral-800 dark:text-neutral-100">
        <p className="max-w-md text-sm font-medium">
          使用工作台需要先连接钱包
        </p>
        <p className="max-w-md text-xs text-neutral-500 dark:text-neutral-400">
          已尝试唤起钱包；你也可以手动发起连接，或返回首页。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void requestConnect()}
            disabled={isConnectPending}
            className="cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            连接钱包
          </button>
          <Link
            href="/"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-600"
          >
            返回首页
          </Link>
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          若约 30 秒内仍未连接，将自动返回首页
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-neutral-900 dark:text-neutral-100">
      <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
        <nav className="mx-auto flex max-w-4xl items-center gap-1 px-4 py-3">
          <button
            type="button"
            onClick={() => setTab("novels")}
            className={
              tab === "novels"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            我的小说
          </button>
          <button
            type="button"
            onClick={() => setTab("publish")}
            className={
              tab === "publish"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            发布管理
          </button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={
              tab === "settings"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            账户设置
          </button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {tab === "novels" && (
          <div className="space-y-8">
            <button
              type="button"
              onClick={openModal}
              className="flex w-full max-w-md cursor-pointer flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-left transition hover:border-cyan-500/60 hover:bg-cyan-50/50 dark:border-neutral-600 dark:bg-neutral-900/50 dark:hover:border-cyan-400/50 dark:hover:bg-cyan-950/20"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
                <Plus className="h-6 w-6" aria-hidden />
              </span>
              <span className="text-lg font-semibold">新建小说</span>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                创建一部新作品，填写标题与简介后即可进入编辑器
              </span>
            </button>

            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                全部作品
              </h2>
              {loadingList ? (
                <p className="text-sm text-neutral-500">加载中…</p>
              ) : novels.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  暂无小说，点击上方卡片开始创作。
                </p>
              ) : (
                <ul className="space-y-2">
                  {novels.map((n) => (
                    <li key={n.id}>
                      <Link
                        href={`/editor/${encodeURIComponent(n.id)}`}
                        className="block rounded-xl border border-neutral-200 bg-white px-4 py-3 transition hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:border-neutral-500"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">{n.title}</span>
                          <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                            {n.wordCount.toLocaleString("zh-CN")} 字
                            <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">
                              ·
                            </span>
                            最后修改 {formatModified(n.lastModified)}
                          </span>
                        </div>
                        {n.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                            {n.description}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "publish" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">发布管理</h2>
            <p className="max-w-xl text-sm text-neutral-600 dark:text-neutral-400">
              查看每部作品的读者可见状态。详细配置与撤回请在对应作品的编辑器大纲区操作。
            </p>
            <div className="overflow-hidden rounded-xl border border-[#1e2a3f] bg-[#121a29]">
              {loadingPublish ? (
                <p className="p-4 text-sm text-zinc-400">加载中…</p>
              ) : publishRows.length === 0 ? (
                <p className="p-4 text-sm text-zinc-400">暂无作品</p>
              ) : (
                <ul className="divide-y divide-[#1e2a3f]">
                  {publishRows.map((row) => {
                    const st = publishStatusLabelZh(
                      derivePublishDisplayStatus(row.record),
                    );
                    const ts = row.record?.publishedAt
                      ? formatModified(row.record.publishedAt)
                      : "—";
                    return (
                      <li
                        key={row.novelId}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-100">
                            {row.novelTitle}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            最后配置 {ts}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#4fc3f7]/40 bg-[#0a0e17] px-2.5 py-0.5 text-[11px] font-medium text-[#4fc3f7]">
                            {st}
                          </span>
                          <Link
                            href={`/editor/${encodeURIComponent(row.novelId)}`}
                            className="rounded-lg border border-[#4fc3f7]/50 px-3 py-1.5 text-xs font-medium text-[#4fc3f7] hover:bg-[#4fc3f7]/10"
                          >
                            进入编辑器
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="max-w-md space-y-4">
            <h2 className="text-lg font-semibold">账户设置</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              当前通过钱包地址标识作者身份。你可在此连接或断开钱包。
            </p>
            <WalletConnect />
          </div>
        )}
      </main>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-novel-title"
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-[var(--background)] p-6 shadow-xl dark:border-neutral-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-novel-title" className="text-lg font-semibold">
              新建小说
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="novel-title-input"
                  className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                >
                  小说标题
                </label>
                <input
                  id="novel-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  placeholder="例如：星海尽头"
                  autoFocus
                />
              </div>
              <div>
                <label
                  htmlFor="novel-desc-input"
                  className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400"
                >
                  内容简介 / 序
                </label>
                <textarea
                  id="novel-desc-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={20000}
                  className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  placeholder="简短介绍故事世界、主线或开篇氛围…"
                />
              </div>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={submitting}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {submitting ? "创建中…" : "确认创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
