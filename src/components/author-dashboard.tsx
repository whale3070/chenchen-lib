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

type Tab =
  | "novels"
  | "publish"
  | "translation"
  | "analytics"
  | "tickets"
  | "settings";
type VideoMaterialId = "clean-carpet" | "cut-soap";
type VideoVoiceId = "gentle-female" | "warm-male" | "energetic-girl";
type TranslationSourceMode = "chapter" | "draft" | "manual";

type PublishRow = {
  novelId: string;
  novelTitle: string;
  record: NovelPublishRecord | null;
};

type ActiveWalletAnalytics = {
  range: string;
  tz: string;
  summary: {
    dau: number;
    wau: number;
    mau: number;
  };
  series: Array<{
    date: string;
    activeWallets: number;
  }>;
  byEventType: Array<{
    eventType: string;
    wallets: number;
    events: number;
  }>;
  generatedAt: string;
};

type TicketItem = {
  id: string;
  createdBy: string;
  title: string;
  content: string;
  status: "open" | "done" | "closed" | "ignored";
  createdAt: string;
  updatedAt: string;
  closedBy: string | null;
  adminNote: string;
};

const VIDEO_MATERIALS: Array<{
  id: VideoMaterialId;
  label: string;
  thumbClassName: string;
}> = [
  {
    id: "clean-carpet",
    label: "清洁地毯",
    thumbClassName:
      "bg-[radial-gradient(circle_at_20%_20%,#86efac,transparent_45%),radial-gradient(circle_at_80%_30%,#4ade80,transparent_40%),linear-gradient(135deg,#14532d,#052e16)]",
  },
  {
    id: "cut-soap",
    label: "切肥皂",
    thumbClassName:
      "bg-[radial-gradient(circle_at_25%_25%,#f9a8d4,transparent_45%),radial-gradient(circle_at_70%_35%,#f472b6,transparent_40%),linear-gradient(135deg,#831843,#500724)]",
  },
];

const VIDEO_VOICES: Array<{ id: VideoVoiceId; label: string }> = [
  { id: "gentle-female", label: "温柔女声" },
  { id: "warm-male", label: "磁性男声" },
  { id: "energetic-girl", label: "活力少女" },
];

const TRANSLATION_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "英语" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "es", label: "西班牙语" },
  { code: "ru", label: "俄语" },
  { code: "pt", label: "葡萄牙语" },
  { code: "it", label: "意大利语" },
  { code: "vi", label: "越南语" },
  { code: "th", label: "泰语" },
];

const TRANSLATION_EDITOR_SESSION_PREFIX = "translation-editor-pair:";
const ANALYTICS_EVENT_LABELS_ZH: Record<string, string> = {
  save_draft: "保存草稿",
  publish_change: "发布配置变更",
  translate: "触发翻译",
  reader_unlock: "读者解锁",
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
    PublishRow[]
  >([]);
  const [loadingPublish, setLoadingPublish] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<{
    title: string;
    synopsis: string;
    articleId: string;
  } | null>(null);
  const [shareQrDataUrl, setShareQrDataUrl] = useState<string>("");
  const [leadVideoOpen, setLeadVideoOpen] = useState(false);
  const [leadVideoTarget, setLeadVideoTarget] = useState<{
    novelId: string;
    novelTitle: string;
  } | null>(null);
  const [videoSnippet, setVideoSnippet] = useState("");
  const [videoSnippetLoading, setVideoSnippetLoading] = useState(false);
  const [videoMaterial, setVideoMaterial] =
    useState<VideoMaterialId>("clean-carpet");
  const [videoVoice, setVideoVoice] = useState<VideoVoiceId>("gentle-female");
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [preferredTranslationLanguages, setPreferredTranslationLanguages] =
    useState<string[]>(["en", "ja"]);
  const [defaultTranslationLanguage, setDefaultTranslationLanguage] =
    useState("en");
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [translationNovelId, setTranslationNovelId] = useState<string>("");
  const [translationSourceMode, setTranslationSourceMode] =
    useState<TranslationSourceMode>("chapter");
  const [translationChapters, setTranslationChapters] = useState<
    Array<{ id: string; title: string; preview: string; isPublished: boolean }>
  >([]);
  const [translationHasDraft, setTranslationHasDraft] = useState(false);
  const [translationChapterId, setTranslationChapterId] = useState("");
  const [translationSourcePreview, setTranslationSourcePreview] = useState("");
  const [translationManualText, setTranslationManualText] = useState("");
  const [translationTargetLanguage, setTranslationTargetLanguage] =
    useState("en");
  const [translationOutputText, setTranslationOutputText] = useState("");
  const [translationEngineModel, setTranslationEngineModel] = useState("");
  const [translationLoadingSources, setTranslationLoadingSources] =
    useState(false);
  const [translationRunning, setTranslationRunning] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d" | "90d">(
    "30d",
  );
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<ActiveWalletAnalytics | null>(
    null,
  );
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketIsAdmin, setTicketIsAdmin] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketContent, setTicketContent] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

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

  const loadTranslationPreferences = useCallback(async () => {
    if (!address) return;
    setPrefsLoading(true);
    try {
      const res = await fetch(
        `/api/v1/novel-translation/preferences?authorId=${encodeURIComponent(address)}`,
        {
          headers: { "x-wallet-address": address },
        },
      );
      const data = (await res.json()) as {
        preferredLanguages?: string[];
        defaultTargetLanguage?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载翻译偏好失败");
      const preferred =
        data.preferredLanguages && data.preferredLanguages.length > 0
          ? data.preferredLanguages
          : ["en", "ja"];
      const defaultLang =
        data.defaultTargetLanguage && data.defaultTargetLanguage.trim()
          ? data.defaultTargetLanguage
          : preferred[0] ?? "en";
      setPreferredTranslationLanguages(preferred);
      setDefaultTranslationLanguage(defaultLang);
      setTranslationTargetLanguage(defaultLang);
    } catch (e) {
      console.error(e);
    } finally {
      setPrefsLoading(false);
    }
  }, [address]);

  const loadTranslationSources = useCallback(
    async (novelId: string) => {
      if (!address || !novelId) return;
      setTranslationLoadingSources(true);
      setTranslationError(null);
      try {
        const res = await fetch(
          `/api/v1/novel-translation/sources?authorId=${encodeURIComponent(address)}&novelId=${encodeURIComponent(novelId)}`,
          {
            headers: { "x-wallet-address": address },
          },
        );
        const data = (await res.json()) as {
          chapters?: Array<{
            id: string;
            title: string;
            preview: string;
            isPublished: boolean;
          }>;
          hasDraft?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "加载章节失败");
        const chapters = data.chapters ?? [];
        setTranslationChapters(chapters);
        setTranslationHasDraft(Boolean(data.hasDraft));
        const first = chapters[0];
        setTranslationChapterId((prev) => prev || first?.id || "");
        if (first?.preview) setTranslationSourcePreview(first.preview);
      } catch (e) {
        setTranslationChapters([]);
        setTranslationHasDraft(false);
        setTranslationError(e instanceof Error ? e.message : "加载章节失败");
      } finally {
        setTranslationLoadingSources(false);
      }
    },
    [address],
  );

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(
        `/api/v1/analytics/active-wallets?range=${encodeURIComponent(analyticsRange)}&groupBy=day&tz=${encodeURIComponent("Asia/Shanghai")}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as ActiveWalletAnalytics & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载活跃钱包数据失败");
      setAnalyticsData(data);
    } catch (e) {
      setAnalyticsData(null);
      setAnalyticsError(e instanceof Error ? e.message : "加载活跃钱包数据失败");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsRange]);

  const loadTickets = useCallback(async () => {
    if (!address) return;
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const res = await fetch("/api/v1/tickets", {
        headers: { "x-wallet-address": address },
      });
      const data = (await res.json()) as {
        items?: TicketItem[];
        isAdmin?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载工单失败");
      setTickets(data.items ?? []);
      setTicketIsAdmin(data.isAdmin === true);
    } catch (e) {
      setTickets([]);
      setTicketIsAdmin(false);
      setTicketsError(e instanceof Error ? e.message : "加载工单失败");
    } finally {
      setTicketsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (tab === "novels" && address) void loadNovels();
  }, [tab, address, loadNovels]);

  useEffect(() => {
    if ((tab === "publish" || tab === "translation") && address) {
      void loadPublishOverview();
    }
  }, [tab, address, loadPublishOverview]);

  useEffect(() => {
    if (tab !== "analytics") return;
    void loadAnalytics();
  }, [tab, loadAnalytics]);

  useEffect(() => {
    if (tab !== "tickets") return;
    void loadTickets();
  }, [tab, loadTickets]);

  useEffect(() => {
    if (!address) return;
    void loadTranslationPreferences();
  }, [address, loadTranslationPreferences]);

  useEffect(() => {
    if (publishRows.length === 0) return;
    if (translationNovelId) return;
    const preferred =
      publishRows.find((r) => derivePublishDisplayStatus(r.record) !== "draft") ??
      publishRows[0];
    setTranslationNovelId(preferred.novelId);
  }, [publishRows, translationNovelId]);

  useEffect(() => {
    if (!translationNovelId) return;
    void loadTranslationSources(translationNovelId);
  }, [translationNovelId, loadTranslationSources]);

  useEffect(() => {
    if (translationSourceMode === "manual") {
      setTranslationSourcePreview(translationManualText.slice(0, 120));
      return;
    }
    if (translationSourceMode === "draft") {
      setTranslationSourcePreview(
        translationHasDraft
          ? "将从当前小说草稿读取全文进行翻译。"
          : "该小说暂无草稿可供翻译。",
      );
      return;
    }
    const selected = translationChapters.find((c) => c.id === translationChapterId);
    setTranslationSourcePreview(selected?.preview ?? "");
  }, [
    translationSourceMode,
    translationManualText,
    translationHasDraft,
    translationChapters,
    translationChapterId,
  ]);

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

  const openLeadVideoModal = async (row: PublishRow) => {
    if (!address) return;
    setLeadVideoTarget({ novelId: row.novelId, novelTitle: row.novelTitle });
    setLeadVideoOpen(true);
    setVideoMaterial("clean-carpet");
    setVideoVoice("gentle-female");
    setVideoProgress(0);
    setVideoGenerating(false);
    setVideoError(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl("");
    }

    setVideoSnippetLoading(true);
    try {
      const res = await fetch("/api/v1/novel-publish/video-snippet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({
          authorId: address,
          novelId: row.novelId,
        }),
      });
      const data = (await res.json()) as { snippet?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "加载片段失败");
      const fallback = (row.record?.synopsis ?? row.novelTitle).slice(0, 300);
      const prefill = (data.snippet ?? fallback).trim().slice(0, 300);
      setVideoSnippet(prefill || "暂无正文片段，请手动填写。");
    } catch {
      const fallback = (row.record?.synopsis ?? row.novelTitle).slice(0, 300);
      setVideoSnippet(fallback || "暂无正文片段，请手动填写。");
    } finally {
      setVideoSnippetLoading(false);
    }
  };

  const closeLeadVideoModal = () => {
    if (videoGenerating) return;
    setLeadVideoOpen(false);
    setLeadVideoTarget(null);
    setVideoProgress(0);
    setVideoError(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl("");
    }
  };

  const handleGenerateLeadVideo = async () => {
    if (!leadVideoTarget || videoGenerating) return;
    const snippet = videoSnippet.trim();
    if (!snippet) {
      setVideoError("请先填写片段预览内容");
      return;
    }
    if (snippet.length > 300) {
      setVideoError("片段预览最多 300 字");
      return;
    }
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl("");
    }
    setVideoError(null);
    setVideoGenerating(true);
    setVideoProgress(6);

    let progress = 6;
    const id = window.setInterval(() => {
      progress = Math.min(92, progress + Math.floor(Math.random() * 12 + 4));
      setVideoProgress(progress);
    }, 260);

    try {
      const blob = await renderLeadVideoBlob({
        title: leadVideoTarget.novelTitle,
        snippet,
        materialId: videoMaterial,
        voiceId: videoVoice,
      });
      window.clearInterval(id);
      setVideoProgress(100);
      setVideoPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      window.clearInterval(id);
      setVideoError(
        e instanceof Error
          ? e.message
          : "生成失败，请更换素材或浏览器后重试",
      );
      setVideoProgress(0);
    } finally {
      setVideoGenerating(false);
    }
  };

  const handleTogglePreferredLanguage = (code: string) => {
    setPreferredTranslationLanguages((prev) => {
      if (prev.includes(code)) {
        const next = prev.filter((x) => x !== code);
        if (next.length === 0) return prev;
        if (!next.includes(defaultTranslationLanguage)) {
          setDefaultTranslationLanguage(next[0]);
          setTranslationTargetLanguage(next[0]);
        }
        return next;
      }
      return [...prev, code];
    });
  };

  const handleSaveTranslationPreferences = async () => {
    if (!address) return;
    setSavingPrefs(true);
    setPrefsMessage(null);
    try {
      const res = await fetch("/api/v1/novel-translation/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({
          authorId: address,
          preferredLanguages: preferredTranslationLanguages,
          defaultTargetLanguage: defaultTranslationLanguage,
        }),
      });
      const data = (await res.json()) as {
        preferredLanguages?: string[];
        defaultTargetLanguage?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      const preferred =
        data.preferredLanguages && data.preferredLanguages.length > 0
          ? data.preferredLanguages
          : preferredTranslationLanguages;
      const defaultLang = data.defaultTargetLanguage || preferred[0] || "en";
      setPreferredTranslationLanguages(preferred);
      setDefaultTranslationLanguage(defaultLang);
      setTranslationTargetLanguage(defaultLang);
      setPrefsMessage("翻译语言偏好已保存");
    } catch (e) {
      setPrefsMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRunTranslation = async () => {
    if (!address || !translationNovelId || translationRunning) return;
    if (translationSourceMode === "chapter" && !translationChapterId) {
      setTranslationError("请选择章节后再翻译");
      return;
    }
    if (translationSourceMode === "draft" && !translationHasDraft) {
      setTranslationError("当前小说暂无草稿可翻译");
      return;
    }
    if (translationSourceMode === "manual" && !translationManualText.trim()) {
      setTranslationError("请先输入要翻译的文本");
      return;
    }

    setTranslationError(null);
    setTranslationRunning(true);
    setTranslationProgress(5);
    let p = 5;
    const timer = window.setInterval(() => {
      p = Math.min(90, p + Math.floor(Math.random() * 8 + 4));
      setTranslationProgress(p);
    }, 220);

    try {
      const res = await fetch("/api/v1/novel-translation/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({
          authorId: address,
          novelId: translationNovelId,
          sourceType: translationSourceMode,
          chapterId: translationSourceMode === "chapter" ? translationChapterId : undefined,
          targetLanguage: translationTargetLanguage,
          text: translationSourceMode === "manual" ? translationManualText : undefined,
        }),
      });
      const data = (await res.json()) as {
        sourceText?: string;
        translatedText?: string;
        model?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "翻译失败");
      setTranslationSourcePreview((data.sourceText ?? "").slice(0, 120));
      const sourceText = data.sourceText ?? "";
      const translatedText = data.translatedText ?? "";
      setTranslationOutputText(translatedText);
      setTranslationEngineModel(data.model ?? "");
      setTranslationProgress(100);
      if (typeof window !== "undefined") {
        const key = `${TRANSLATION_EDITOR_SESSION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        window.sessionStorage.setItem(
          key,
          JSON.stringify({
            novelId: translationNovelId,
            sourceText,
            translatedText,
            targetLanguage: translationTargetLanguage,
            createdAt: Date.now(),
          }),
        );
        router.push(
          `/editor/${encodeURIComponent(translationNovelId)}?translationPairKey=${encodeURIComponent(key)}`,
        );
      }
    } catch (e) {
      setTranslationError(e instanceof Error ? e.message : "翻译失败");
      setTranslationProgress(0);
    } finally {
      window.clearInterval(timer);
      setTranslationRunning(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!address || ticketSubmitting) return;
    const title = ticketTitle.trim();
    const content = ticketContent.trim();
    if (!title) {
      setTicketsError("请填写工单标题");
      return;
    }
    if (!content) {
      setTicketsError("请填写工单详情");
      return;
    }
    setTicketSubmitting(true);
    setTicketsError(null);
    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({ title, content }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "提交工单失败");
      setTicketTitle("");
      setTicketContent("");
      await loadTickets();
    } catch (e) {
      setTicketsError(e instanceof Error ? e.message : "提交工单失败");
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleUpdateTicketStatus = async (
    ticketId: string,
    status: TicketItem["status"],
  ) => {
    if (!address || !ticketIsAdmin) return;
    setTicketsError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "更新工单状态失败");
      await loadTickets();
    } catch (e) {
      setTicketsError(e instanceof Error ? e.message : "更新工单状态失败");
    }
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

    const qrImage = await loadImage(shareQrDataUrl);
    const qrSize = 520;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = 560;
    ctx.fillStyle = "#ffffff";
    roundRectFill(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 20);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "30px sans-serif";
    const intro = sharePayload.synopsis || "扫码即可阅读，适合移动端浏览。";
    const introStartY = 330;
    const introLineHeight = 46;
    const introMaxLines = Math.max(
      2,
      Math.floor((qrY - 90 - introStartY) / introLineHeight),
    );
    drawWrappedCenteredTextClamped(
      ctx,
      intro,
      540,
      introStartY,
      820,
      introLineHeight,
      introMaxLines,
    );

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
          <button
            type="button"
            onClick={() => setTab("translation")}
            className={
              tab === "translation"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            多语言翻译
          </button>
          <button
            type="button"
            onClick={() => setTab("analytics")}
            className={
              tab === "analytics"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            活跃钱包看板
          </button>
          <button
            type="button"
            onClick={() => setTab("tickets")}
            className={
              tab === "tickets"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            工单管理
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
                          <button
                            type="button"
                            onClick={() => void openLeadVideoModal(row)}
                            className="rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20"
                          >
                            一键引流视频
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

        {tab === "translation" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">多语言翻译</h2>
            <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              关联发布管理数据，可直接对发布章节或草稿进行翻译。支持手动触发、多语言目标选择，以及翻译后在线预览与编辑。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    选择小说
                  </label>
                  <select
                    value={translationNovelId}
                    onChange={(e) => {
                      setTranslationNovelId(e.target.value);
                      setTranslationOutputText("");
                      setTranslationError(null);
                    }}
                    className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="">请选择小说</option>
                    {publishRows.map((row) => (
                      <option key={row.novelId} value={row.novelId}>
                        {row.novelTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-300">翻译来源</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTranslationSourceMode("chapter")}
                      className={
                        translationSourceMode === "chapter"
                          ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-200"
                          : "rounded-md border border-[#324866] bg-[#0d1625] px-2.5 py-1 text-xs text-zinc-300"
                      }
                    >
                      发布章节
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranslationSourceMode("draft")}
                      className={
                        translationSourceMode === "draft"
                          ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-200"
                          : "rounded-md border border-[#324866] bg-[#0d1625] px-2.5 py-1 text-xs text-zinc-300"
                      }
                    >
                      草稿
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranslationSourceMode("manual")}
                      className={
                        translationSourceMode === "manual"
                          ? "rounded-md border border-cyan-400/60 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-200"
                          : "rounded-md border border-[#324866] bg-[#0d1625] px-2.5 py-1 text-xs text-zinc-300"
                      }
                    >
                      手动输入
                    </button>
                  </div>
                </div>

                {translationSourceMode === "chapter" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      章节选择
                    </label>
                    <select
                      value={translationChapterId}
                      onChange={(e) => setTranslationChapterId(e.target.value)}
                      disabled={translationLoadingSources}
                      className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="">
                        {translationLoadingSources ? "加载章节中…" : "请选择章节"}
                      </option>
                      {translationChapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          {chapter.title}
                          {chapter.isPublished ? "（已发布）" : "（草稿章节）"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {translationSourceMode === "manual" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      输入要翻译的文本
                    </label>
                    <textarea
                      value={translationManualText}
                      onChange={(e) => setTranslationManualText(e.target.value)}
                      rows={6}
                      className="w-full resize-y rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                      placeholder="粘贴章节片段或草稿内容"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    目标语言
                  </label>
                  <select
                    value={translationTargetLanguage}
                    onChange={(e) => setTranslationTargetLanguage(e.target.value)}
                    className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                  >
                    {TRANSLATION_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    默认语言来自账户设置，可随时切换。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleRunTranslation()}
                  disabled={translationRunning || !translationNovelId}
                  className="w-full rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {translationRunning ? "翻译中…" : "手动触发翻译"}
                </button>

                {(translationRunning || translationProgress > 0) && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>翻译进度</span>
                      <span>{translationProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#17263b]">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all"
                        style={{ width: `${translationProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <div className="rounded-lg border border-[#2d405e] bg-[#0d1625] p-3">
                  <p className="text-xs font-medium text-zinc-300">原文预览</p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    {translationSourcePreview || "选择章节/草稿后将显示原文摘要"}
                  </p>
                </div>

                {translationError ? (
                  <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {translationError}
                  </p>
                ) : null}

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    翻译结果（可编辑）
                  </label>
                  <textarea
                    value={translationOutputText}
                    onChange={(e) => setTranslationOutputText(e.target.value)}
                    rows={14}
                    className="w-full resize-y rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                    placeholder="翻译完成后可在此预览和手动编辑"
                  />
                </div>
                {translationEngineModel ? (
                  <p className="text-[11px] text-zinc-500">
                    DeepSeek 模型：{translationEngineModel}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">活跃钱包看板</h2>
              <div className="flex items-center gap-2">
                <select
                  value={analyticsRange}
                  onChange={(e) =>
                    setAnalyticsRange(e.target.value as "7d" | "30d" | "90d")
                  }
                  className="rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-1.5 text-xs text-zinc-200"
                >
                  <option value="7d">近 7 天</option>
                  <option value="30d">近 30 天</option>
                  <option value="90d">近 90 天</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadAnalytics()}
                  disabled={analyticsLoading}
                  className="rounded-lg border border-cyan-400/50 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {analyticsLoading ? "刷新中…" : "刷新数据"}
                </button>
              </div>
            </div>
            <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              统计口径：按钱包地址去重。DAU=今日，WAU=近 7 天，MAU=近 30 天。
            </p>

            {analyticsError ? (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {analyticsError}
              </p>
            ) : null}

            {analyticsLoading && !analyticsData ? (
              <p className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4 text-sm text-zinc-400">
                加载中…
              </p>
            ) : analyticsData ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                    <p className="text-xs text-zinc-500">DAU（今日）</p>
                    <p className="mt-1 text-2xl font-semibold text-cyan-300">
                      {analyticsData.summary.dau.toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                    <p className="text-xs text-zinc-500">WAU（近 7 天）</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-300">
                      {analyticsData.summary.wau.toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                    <p className="text-xs text-zinc-500">MAU（近 30 天）</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-300">
                      {analyticsData.summary.mau.toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                  <p className="mb-3 text-xs font-medium text-zinc-300">
                    近 {analyticsData.range} 活跃钱包趋势
                  </p>
                  <div className="flex h-44 items-end gap-1 overflow-x-auto rounded-lg border border-[#2a3b57] bg-[#0f1726] p-3">
                    {(() => {
                      const max = Math.max(
                        ...analyticsData.series.map((x) => x.activeWallets),
                        1,
                      );
                      return analyticsData.series.map((point) => {
                        const h = Math.max(
                          6,
                          Math.round((point.activeWallets / max) * 120),
                        );
                        return (
                          <div
                            key={point.date}
                            className="flex min-w-[18px] flex-col items-center justify-end gap-1"
                            title={`${point.date}: ${point.activeWallets}`}
                          >
                            <div
                              className="w-3 rounded-sm bg-gradient-to-t from-cyan-500 to-indigo-400"
                              style={{ height: `${h}px` }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                  <p className="mb-2 text-xs font-medium text-zinc-300">行为分布</p>
                  {analyticsData.byEventType.length === 0 ? (
                    <p className="text-xs text-zinc-500">暂无行为数据</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {analyticsData.byEventType.map((row) => (
                        <li
                          key={row.eventType}
                          className="flex items-center justify-between rounded-md border border-[#2a3b57] bg-[#0f1726] px-3 py-2 text-xs"
                        >
                          <span className="text-zinc-300">
                            {ANALYTICS_EVENT_LABELS_ZH[row.eventType] ?? row.eventType}
                          </span>
                          <span className="text-zinc-500">
                            钱包 {row.wallets.toLocaleString("zh-CN")} · 事件{" "}
                            {row.events.toLocaleString("zh-CN")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4 text-sm text-zinc-400">
                暂无数据
              </p>
            )}
          </div>
        )}

        {tab === "tickets" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">工单管理</h2>
            <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              连接钱包后可提交需求工单。管理员（ADMIN_ADDRESS）可将工单标记为已完成、已关闭、已忽略。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <h3 className="text-sm font-semibold text-zinc-100">提交新工单</h3>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">标题</label>
                  <input
                    type="text"
                    value={ticketTitle}
                    onChange={(e) => setTicketTitle(e.target.value)}
                    maxLength={120}
                    className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                    placeholder="例如：希望支持批量导出"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">需求详情</label>
                  <textarea
                    value={ticketContent}
                    onChange={(e) => setTicketContent(e.target.value)}
                    rows={7}
                    maxLength={5000}
                    className="w-full resize-y rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                    placeholder="请尽量写清楚使用场景和预期行为"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateTicket()}
                  disabled={ticketSubmitting}
                  className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ticketSubmitting ? "提交中…" : "提交工单"}
                </button>
              </section>

              <section className="space-y-3 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {ticketIsAdmin ? "全部工单" : "我的工单"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadTickets()}
                    disabled={ticketsLoading}
                    className="rounded border border-[#324866] px-2.5 py-1 text-xs text-zinc-300 hover:bg-[#0d1625] disabled:opacity-50"
                  >
                    刷新
                  </button>
                </div>
                {ticketsError ? (
                  <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {ticketsError}
                  </p>
                ) : null}
                {ticketsLoading ? (
                  <p className="text-xs text-zinc-500">加载中…</p>
                ) : tickets.length === 0 ? (
                  <p className="text-xs text-zinc-500">暂无工单</p>
                ) : (
                  <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {tickets.map((ticket) => (
                      <li
                        key={ticket.id}
                        className="rounded-lg border border-[#2a3b57] bg-[#0f1726] p-3"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {ticket.title}
                          </p>
                          <span className="rounded-full border border-cyan-400/40 px-2 py-0.5 text-[11px] text-cyan-300">
                            {TICKET_STATUS_LABELS_ZH[ticket.status] ?? ticket.status}
                          </span>
                        </div>
                        <p className="line-clamp-3 text-xs leading-relaxed text-zinc-400">
                          {ticket.content}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {ticket.createdBy} · {formatModified(ticket.createdAt)}
                        </p>
                        {ticket.adminNote ? (
                          <p className="mt-1 text-[11px] text-amber-300">
                            管理员备注：{ticket.adminNote}
                          </p>
                        ) : null}
                        {ticketIsAdmin ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleUpdateTicketStatus(ticket.id, "done")}
                              className="rounded border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                            >
                              标记已完成
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleUpdateTicketStatus(ticket.id, "closed")}
                              className="rounded border border-zinc-500/40 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-500/10"
                            >
                              标记已关闭
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleUpdateTicketStatus(ticket.id, "ignored")}
                              className="rounded border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/10"
                            >
                              标记已忽略
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-lg font-semibold">账户设置</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              当前通过钱包地址标识作者身份。你可在此连接或断开钱包，并保存多语言翻译偏好。
            </p>
            <WalletConnect />

            <section className="space-y-3 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
              <h3 className="text-sm font-semibold text-zinc-100">翻译语言偏好</h3>
              <p className="text-xs text-zinc-400">
                勾选常用目标语言，并设置默认翻译语言。多语言翻译模块会自动读取这里的配置。
              </p>
              <div className="flex flex-wrap gap-2">
                {TRANSLATION_LANGUAGES.map((lang) => (
                  <label
                    key={lang.code}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs ${
                      preferredTranslationLanguages.includes(lang.code)
                        ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                        : "border-[#324866] bg-[#0d1625] text-zinc-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={preferredTranslationLanguages.includes(lang.code)}
                      onChange={() => handleTogglePreferredLanguage(lang.code)}
                    />
                    {lang.label}
                  </label>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  默认翻译语言
                </label>
                <select
                  value={defaultTranslationLanguage}
                  onChange={(e) => {
                    setDefaultTranslationLanguage(e.target.value);
                    setTranslationTargetLanguage(e.target.value);
                  }}
                  disabled={prefsLoading}
                  className="w-full max-w-xs rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                >
                  {preferredTranslationLanguages.map((code) => (
                    <option key={code} value={code}>
                      {TRANSLATION_LANGUAGES.find((l) => l.code === code)?.label ??
                        code.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveTranslationPreferences()}
                disabled={savingPrefs || preferredTranslationLanguages.length === 0}
                className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPrefs ? "保存中…" : "保存翻译偏好"}
              </button>
              {prefsMessage ? (
                <p className="text-xs text-zinc-400">{prefsMessage}</p>
              ) : null}
            </section>
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

      {leadVideoOpen && leadVideoTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) =>
            e.target === e.currentTarget && !videoGenerating && closeLeadVideoModal()
          }
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="一键引流视频"
            className="w-full max-w-3xl rounded-2xl border border-[#2a3a54] bg-[#0b1320] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-amber-300">
                一键引流视频 · 《{leadVideoTarget.novelTitle}》
              </h3>
              <button
                type="button"
                onClick={closeLeadVideoModal}
                disabled={videoGenerating}
                className="rounded border border-neutral-600 px-2 py-0.5 text-xs text-neutral-300 hover:border-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                关闭
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-[#21324a] bg-[#101a2c] p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    片段预览（自动截取章节前 300 字，可手动编辑）
                  </label>
                  <textarea
                    value={videoSnippet}
                    onChange={(e) => setVideoSnippet(e.target.value.slice(0, 300))}
                    rows={6}
                    disabled={videoSnippetLoading || videoGenerating}
                    className="w-full resize-y rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                    placeholder={videoSnippetLoading ? "正在提取章节片段…" : "请输入片段预览"}
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {videoSnippet.length}/300
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-300">素材预览（单选）</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_MATERIALS.map((mat) => (
                      <label
                        key={mat.id}
                        className={`cursor-pointer rounded-lg border p-2 ${
                          videoMaterial === mat.id
                            ? "border-amber-400 bg-amber-500/10"
                            : "border-[#2d405e] bg-[#0d1625]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="lead-video-material"
                          className="sr-only"
                          checked={videoMaterial === mat.id}
                          onChange={() => setVideoMaterial(mat.id)}
                          disabled={videoGenerating}
                        />
                        <div
                          className={`h-20 rounded-md border border-[#3a4f6c] ${mat.thumbClassName}`}
                        />
                        <p className="mt-2 text-center text-xs text-zinc-200">{mat.label}</p>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    配音设置
                  </label>
                  <select
                    value={videoVoice}
                    onChange={(e) => setVideoVoice(e.target.value as VideoVoiceId)}
                    disabled={videoGenerating}
                    className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                  >
                    {VIDEO_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-[#21324a] bg-[#101a2c] p-4">
                <button
                  type="button"
                  onClick={() => void handleGenerateLeadVideo()}
                  disabled={videoGenerating || videoSnippetLoading}
                  className="w-full rounded-lg border border-amber-400/60 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {videoGenerating ? "生成中…" : "开始生成"}
                </button>

                {(videoGenerating || videoProgress > 0) && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>生成进度</span>
                      <span>{videoProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#17263b]">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {videoError ? (
                  <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {videoError}
                  </p>
                ) : null}

                {videoPreviewUrl ? (
                  <div className="space-y-3 rounded-lg border border-[#2f4564] bg-[#0b1320] p-3">
                    <p className="text-xs font-medium text-zinc-300">视频预览</p>
                    <video
                      src={videoPreviewUrl}
                      controls
                      className="aspect-[9/16] w-full rounded-lg border border-[#2d405e] bg-black"
                    />
                    <a
                      href={videoPreviewUrl}
                      download={`${leadVideoTarget.novelTitle}-引流视频.webm`}
                      className="inline-flex rounded-md border border-emerald-500/60 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
                    >
                      下载到本地发布 TikTok/抖音
                    </a>
                  </div>
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center rounded-lg border border-dashed border-[#2d405e] bg-[#0d1625] text-xs text-zinc-500">
                    生成成功后将在此展示视频预览
                  </div>
                )}
              </div>
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

function drawWrappedCenteredTextClamped(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const chars = text.split("");
  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const overflowed = lines.length >= maxLines && chars.join("").length > lines.join("").length;
  if (overflowed && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }
  lines.forEach((l, i) => {
    ctx.fillText(l, centerX, startY + i * lineHeight);
  });
  return lines.length;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}

function pickVoiceLabel(id: VideoVoiceId): string {
  return VIDEO_VOICES.find((x) => x.id === id)?.label ?? "默认配音";
}

function drawWrappedLeftText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const chars = text.split("");
  const lines: string[] = [];
  let current = "";
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
}

async function renderLeadVideoBlob(input: {
  title: string;
  snippet: string;
  materialId: VideoMaterialId;
  voiceId: VideoVoiceId;
}): Promise<Blob> {
  if (
    typeof window === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement === "undefined"
  ) {
    throw new Error("当前浏览器不支持视频导出");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法初始化视频画布");

  const stream = canvas.captureStream(24);
  const chunks: BlobPart[] = [];
  let mimeType = "video/webm";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    mimeType = "video/webm;codecs=vp9";
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    mimeType = "video/webm;codecs=vp8";
  }

  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };

  const duration = 3200;
  const started = performance.now();

  const drawFrame = (now: number) => {
    const elapsed = Math.min(duration, now - started);
    const t = elapsed / duration;

    if (input.materialId === "clean-carpet") {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, "#14532d");
      g.addColorStop(1, "#052e16");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(134,239,172,0.28)";
    } else {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, "#831843");
      g.addColorStop(1, "#500724");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(249,168,212,0.24)";
    }

    for (let i = 0; i < 7; i += 1) {
      const y = ((i * 210 + elapsed * 0.15) % (canvas.height + 180)) - 120;
      ctx.fillRect(36, y, canvas.width - 72, 100);
    }

    ctx.fillStyle = "rgba(3,7,18,0.55)";
    roundRectFill(ctx, 40, 80, canvas.width - 80, canvas.height - 160, 28);

    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "left";
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(`《${input.title.slice(0, 20)}》`, 86, 170);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "24px sans-serif";
    ctx.fillText(`配音：${pickVoiceLabel(input.voiceId)}`, 86, 220);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "30px sans-serif";
    drawWrappedLeftText(
      ctx,
      input.snippet,
      86,
      300,
      canvas.width - 172,
      46,
      16,
    );

    ctx.fillStyle = "rgba(251,191,36,0.86)";
    ctx.fillRect(86, canvas.height - 140, (canvas.width - 172) * t, 10);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("轻触关注，继续追更", 86, canvas.height - 90);

    if (elapsed < duration) {
      requestAnimationFrame(drawFrame);
    } else {
      recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error("视频录制失败"));
    recorder.onstop = () => {
      if (chunks.length === 0) {
        reject(new Error("未生成可下载的视频文件"));
        return;
      }
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.start(120);
    requestAnimationFrame(drawFrame);
  });
}
