"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

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
  const [editOpen, setEditOpen] = useState(false);
  const [editingNovelId, setEditingNovelId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  /** 发布模块：工作台聚合列表 */
  const [publishRows, setPublishRows] = useState<
    {
      novelId: string;
      novelTitle: string;
      record: NovelPublishRecord | null;
    }[]
  >([]);
  const [loadingPublish, setLoadingPublish] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<{
    title: string;
    synopsis: string;
    articleId: string;
  } | null>(null);
  const [shareQrDataUrl, setShareQrDataUrl] = useState<string>("");

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

  const openEditModal = (novel: NovelListItem) => {
    setEditingNovelId(novel.id);
    setEditTitle(novel.title);
    setEditDescription(novel.description ?? "");
    setEditError(null);
    setEditOpen(true);
  };

  const closeEditModal = () => {
    if (editSubmitting) return;
    setEditOpen(false);
  };

  const handleSaveEdit = async () => {
    if (!address || !editingNovelId) return;
    const t = editTitle.trim();
    if (!t) {
      setEditError("请填写小说标题");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch("/api/v1/novels", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({
          authorId: address,
          novelId: editingNovelId,
          title: t,
          description: editDescription.trim(),
        }),
      });
      const data = (await res.json()) as {
        novel?: NovelListItem;
        error?: string;
      };
      if (!res.ok || !data.novel) {
        throw new Error(data.error ?? "保存失败");
      }
      setNovels((prev) =>
        prev.map((n) => (n.id === data.novel!.id ? data.novel! : n)),
      );
      setEditOpen(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setEditSubmitting(false);
    }
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

  const openShareModal = (row: {
    novelTitle: string;
    record: NovelPublishRecord | null;
  }) => {
    const articleId = row.record?.articleId?.trim();
    if (!articleId) {
      window.alert("该作品尚未分配文章ID，无法生成分享卡。");
      return;
    }
    setSharePayload({
      title: row.novelTitle,
      synopsis: row.record?.synopsis ?? "",
      articleId,
    });
    setShareOpen(true);
  };

  const closeShareModal = () => {
    setShareOpen(false);
  };

  const handleDownloadShareImage = useCallback(async () => {
    if (!sharePayload || !shareQrDataUrl) return;
    const targetUrl = `${window.location.origin}/library/${sharePayload.articleId}`;

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1520;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      window.alert("生成分享图失败：无法初始化画布");
      return;
    }

    // Background
    ctx.fillStyle = "#0b1320";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Card
    ctx.fillStyle = "#101a2c";
    roundRectFill(ctx, 70, 60, 940, 1400, 28);

    ctx.fillStyle = "#e5e7eb";
    ctx.font = "bold 54px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`《${sharePayload.title}》小说`, 540, 185);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "36px sans-serif";
    ctx.fillText(`${sharePayload.title}读者入口`, 540, 245);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "30px sans-serif";
    const intro = sharePayload.synopsis || "扫码即可阅读，适合移动端浏览。";
    drawWrappedCenteredText(ctx, intro, 540, 330, 820, 48);

    const qrImage = await loadImage(shareQrDataUrl);
    const qrSize = 520;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = 490;
    ctx.fillStyle = "#ffffff";
    roundRectFill(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 20);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "26px sans-serif";
    drawWrappedCenteredText(ctx, targetUrl, 540, 1100, 860, 38);

    ctx.fillStyle = "#22d3ee";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("扫码即可阅读，适合移动端浏览。", 540, 1370);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${sharePayload.title}-小说分享图.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [sharePayload, shareQrDataUrl]);

  useEffect(() => {
    if (!shareOpen || !sharePayload) {
      setShareQrDataUrl("");
      return;
    }
    let cancelled = false;
    const targetUrl = `${window.location.origin}/library/${sharePayload.articleId}`;
    void QRCode.toDataURL(targetUrl, {
      width: 520,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (!cancelled) setShareQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setShareQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [shareOpen, sharePayload]);

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
                      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 transition hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:border-neutral-500">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <Link
                            href={`/editor/${encodeURIComponent(n.id)}`}
                            className="font-medium hover:underline"
                          >
                            {n.title}
                          </Link>
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                              {n.wordCount.toLocaleString("zh-CN")} 字
                              <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">
                                ·
                              </span>
                              最后修改 {formatModified(n.lastModified)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEditModal(n)}
                              className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            >
                              编辑
                            </button>
                          </div>
                        </div>
                        {n.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                            {n.description}
                          </p>
                        ) : null}
                      </div>
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
                    const canShare =
                      derivePublishDisplayStatus(row.record) === "public" &&
                      Boolean(row.record?.articleId);
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
                          <button
                            type="button"
                            disabled={!canShare}
                            onClick={() => openShareModal(row)}
                            className="rounded-lg border border-emerald-400/50 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            社交媒体小说分享
                          </button>
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

      {shareOpen && sharePayload ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeShareModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="小说社交分享"
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-[#0b1320] p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-300">
                社交媒体小说分享
              </h3>
              <button
                type="button"
                onClick={closeShareModal}
                className="rounded border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300 hover:border-emerald-400 hover:text-emerald-300"
              >
                关闭
              </button>
            </div>

            <div className="rounded-xl border border-[#284056] bg-[#101a2c] p-4 text-center">
              <h4 className="text-base font-semibold text-zinc-100">
                《{sharePayload.title}》小说
              </h4>
              <p className="mt-1 text-xs text-zinc-400">{sharePayload.title}读者入口</p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-300">
                {sharePayload.synopsis || "扫码即可阅读，适合移动端浏览。"}
              </p>
              {shareQrDataUrl ? (
                <img
                  src={shareQrDataUrl}
                  alt="小说分享二维码"
                  className="mx-auto mt-4 h-[220px] w-[220px] rounded-lg border border-neutral-700 bg-white p-2"
                />
              ) : (
                <div className="mx-auto mt-4 flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-neutral-700 bg-white p-2 text-xs text-neutral-500">
                  生成二维码中…
                </div>
              )}
              <p className="mt-2 break-all text-[10px] text-zinc-500">
                {`${window.location.origin}/library/${sharePayload.articleId}`}
              </p>
              <button
                type="button"
                disabled={!shareQrDataUrl}
                onClick={() => void handleDownloadShareImage()}
                className="mt-3 rounded-md border border-emerald-500/50 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下载本图片
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeEditModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="编辑小说信息"
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-[var(--background)] p-6 shadow-xl dark:border-neutral-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">编辑小说信息</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  小说标题
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={500}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  placeholder="例如：星海尽头"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  小说简介 / 详情
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={5}
                  maxLength={20000}
                  className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  placeholder="简短介绍故事世界、主线或开篇氛围…"
                />
              </div>
              {editError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={editSubmitting}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={editSubmitting}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {editSubmitting ? "保存中…" : "保存修改"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roundRectFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawWrappedCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
) {
  const chars = text.split("");
  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    ctx.fillText(l, centerX, startY + i * lineHeight);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}
