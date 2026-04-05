"use client";

import { FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

import { WalletConnect } from "@/components/wallet-connect";
import { useWeb3Auth } from "@/hooks/use-web3-auth";
import { chapterizeTxtViaApi, decodeTxtAuto } from "@/lib/txt-import-chapterize";
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
  | "audiobooks"
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
  imageUrls?: string[];
  status: "open" | "done" | "closed" | "ignored";
  createdAt: string;
  updatedAt: string;
  closedBy: string | null;
  adminNote: string;
};

type UploadedAudioItem = {
  name: string;
  url: string;
  size: number;
  mimeType: string;
};

type AudiobookItem = {
  id: string;
  authorId: string;
  novelId: string;
  fileName: string;
  displayName: string;
  synopsis?: string;
  details?: string;
  mimeType: string;
  size: number;
  pathParam: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

type UnifiedWorkItem =
  | { kind: "novel"; sortAt: string; novel: NovelListItem }
  | { kind: "audiobook"; sortAt: string; audiobook: AudiobookItem };

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
const AUDIO_ACCEPT =
  ".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/flac,audio/x-flac";

const NOVEL_TXT_ACCEPT = ".txt,text/plain";

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

async function readApiJsonSafe<T extends Record<string, unknown>>(
  res: Response,
): Promise<T> {
  const raw = await res.text();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return { error: `接口返回非 JSON（HTTP ${res.status}）` } as unknown as T;
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
  const [audiobookEditOpen, setAudiobookEditOpen] = useState(false);
  const [editingAudiobookId, setEditingAudiobookId] = useState<string | null>(null);
  const [audiobookEditTitle, setAudiobookEditTitle] = useState("");
  const [audiobookEditSynopsis, setAudiobookEditSynopsis] = useState("");
  const [audiobookEditDetails, setAudiobookEditDetails] = useState("");
  const [audiobookEditSubmitting, setAudiobookEditSubmitting] = useState(false);
  const [audiobookEditError, setAudiobookEditError] = useState<string | null>(null);

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
    Array<{
      id: string;
      title: string;
      preview: string;
      isPublished: boolean;
      hasEnglishTranslation: boolean;
    }>
  >([]);
  const [translationHasDraft, setTranslationHasDraft] = useState(false);
  const [translationChapterId, setTranslationChapterId] = useState("");
  const [translationSourcePreview, setTranslationSourcePreview] = useState("");
  const [translationSourceFullText, setTranslationSourceFullText] = useState("");
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
  const [ticketImages, setTicketImages] = useState<File[]>([]);
  const [ticketImagePreviewUrls, setTicketImagePreviewUrls] = useState<string[]>([]);
  const [ticketUploadingImages, setTicketUploadingImages] = useState(false);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudioItem[]>([]);
  const [audiobooks, setAudiobooks] = useState<AudiobookItem[]>([]);
  const [audiobooksLoading, setAudiobooksLoading] = useState(false);
  const [audiobooksError, setAudiobooksError] = useState<string | null>(null);
  const [audiobookNovelId, setAudiobookNovelId] = useState("");
  const [renameInputById, setRenameInputById] = useState<Record<string, string>>({});
  const [txtBatchImport, setTxtBatchImport] = useState<{
    active: boolean;
    done: number;
    total: number;
    failures: Array<{ name: string; error: string }>;
  }>({ active: false, done: 0, total: 0, failures: [] });

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const audioUploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const novelTxtInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 不在此自动 requestConnect。刷新后由 wagmi（localStorage + reconnectOnMount）静默恢复会话，
   * 避免每次 F5 都弹出 MetaMask。仅当用户点击「连接钱包」或首页主动连接时才唤起扩展。
   */

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
      const data = await readApiJsonSafe<{
        novels?: NovelListItem[];
        error?: string;
      }>(res);
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
      const data = await readApiJsonSafe<{
        items?: {
          novelId: string;
          novelTitle: string;
          record: NovelPublishRecord | null;
        }[];
        error?: string;
      }>(res);
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
      const data = await readApiJsonSafe<{
        preferredLanguages?: string[];
        defaultTargetLanguage?: string;
        error?: string;
      }>(res);
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
        const data = await readApiJsonSafe<{
          chapters?: Array<{
            id: string;
            title: string;
            preview: string;
            isPublished: boolean;
            hasEnglishTranslation?: boolean;
          }>;
          hasDraft?: boolean;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error ?? "加载章节失败");
        const chapters = (data.chapters ?? []).map((x) => ({
          ...x,
          hasEnglishTranslation: x.hasEnglishTranslation === true,
        }));
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
      const data = await readApiJsonSafe<
        ActiveWalletAnalytics & {
        error?: string;
        }
      >(res);
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
      const data = await readApiJsonSafe<{
        items?: TicketItem[];
        isAdmin?: boolean;
        error?: string;
      }>(res);
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

  const loadAudiobooks = useCallback(async () => {
    if (!address) return;
    setAudiobooksLoading(true);
    setAudiobooksError(null);
    try {
      const res = await fetch(
        `/api/v1/audiobooks?authorId=${encodeURIComponent(address)}`,
        {
          headers: { "x-wallet-address": address },
          cache: "no-store",
        },
      );
      const data = await readApiJsonSafe<{
        items?: AudiobookItem[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "加载有声书失败");
      setAudiobooks(data.items ?? []);
    } catch (e) {
      setAudiobooks([]);
      setAudiobooksError(e instanceof Error ? e.message : "加载有声书失败");
    } finally {
      setAudiobooksLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (tab === "novels" && address) void loadNovels();
  }, [tab, address, loadNovels]);

  useEffect(() => {
    if (tab === "novels" && address) void loadAudiobooks();
  }, [tab, address, loadAudiobooks]);

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

  const openAudiobookEditModal = (item: AudiobookItem) => {
    setEditingAudiobookId(item.id);
    setAudiobookEditTitle(item.displayName || item.fileName || "");
    setAudiobookEditSynopsis(item.synopsis ?? "");
    setAudiobookEditDetails(item.details ?? "");
    setAudiobookEditError(null);
    setAudiobookEditOpen(true);
  };

  const closeAudiobookEditModal = () => {
    if (audiobookEditSubmitting) return;
    setAudiobookEditOpen(false);
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
      const data = await readApiJsonSafe<{
        novel?: NovelListItem;
        error?: string;
      }>(res);
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

  const handleSaveAudiobookEdit = async () => {
    if (!address || !editingAudiobookId) return;
    const title = audiobookEditTitle.trim();
    if (!title) {
      setAudiobookEditError("请填写有声书标题");
      return;
    }
    setAudiobookEditSubmitting(true);
    setAudiobookEditError(null);
    try {
      const res = await fetch("/api/v1/audiobooks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({
          authorId: address,
          id: editingAudiobookId,
          title,
          synopsis: audiobookEditSynopsis,
          details: audiobookEditDetails,
        }),
      });
      const data = await readApiJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      await loadAudiobooks();
      setAudiobookEditOpen(false);
    } catch (e) {
      setAudiobookEditError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setAudiobookEditSubmitting(false);
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
      const data = await readApiJsonSafe<{
        novel?: NovelListItem;
        error?: string;
      }>(res);
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

  const runSingleTxtImport = useCallback(
    async (file: File, wallet: string) => {
      const buf = await file.arrayBuffer();
      const text = decodeTxtAuto(new Uint8Array(buf));
      const baseTitle =
        file.name.replace(/\.txt$/i, "").trim().slice(0, 500) || "未命名作品";
      /** 浏览器内多段调 chapterize，再一次性落库，避免单请求在服务端切章过久被反代 RST */
      const { chapters, batchCount, anyTruncated } = await chapterizeTxtViaApi(
        text,
        "auto",
      );
      const importRes = await fetch("/api/v1/novels/from-chapters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": wallet,
        },
        body: JSON.stringify({
          authorId: wallet,
          title: baseTitle,
          description: "",
          chapters,
          batchCount,
          anyTruncated,
        }),
      });
      const importData = await readApiJsonSafe<{
        novel?: NovelListItem;
        error?: string;
        chapterCount?: number;
      }>(importRes);
      if (!importRes.ok || !importData.novel?.id) {
        throw new Error(
          importData.error ??
            `导入失败（HTTP ${importRes.status}），请稍后再试。`,
        );
      }
      return importData.novel;
    },
    [],
  );

  const handleNovelTxtBatchSelected = useCallback(
    async (files: FileList | null) => {
      if (!address || !files || files.length === 0) return;
      const all = Array.from(files);
      const txtList = all.filter((f) => f.name.toLowerCase().endsWith(".txt"));
      const skipped = all.length - txtList.length;
      if (txtList.length === 0) {
        window.alert("请选择至少一个 .txt 文件。");
        return;
      }
      if (
        !window.confirm(
          `将新建 ${txtList.length} 部小说：本页会分批请求切章（短连接），再保存大纲与首章稿面，避免单次上传超时断开。可继续浏览本页，完成后在下方列表查看${skipped > 0 ? `；已忽略 ${skipped} 个非 .txt 文件` : ""}。是否继续？`,
        )
      ) {
        return;
      }

      setTxtBatchImport({
        active: true,
        done: 0,
        total: txtList.length,
        failures: [],
      });

      const failures: Array<{ name: string; error: string }> = [];

      for (let i = 0; i < txtList.length; i += 1) {
        const file = txtList[i]!;
        try {
          await runSingleTxtImport(file, address);
        } catch (e) {
          failures.push({
            name: file.name,
            error: e instanceof Error ? e.message : "导入失败",
          });
        }
        setTxtBatchImport((prev) => ({
          ...prev,
          done: i + 1,
          failures: [...failures],
        }));
        void loadNovels();
      }

      setTxtBatchImport((prev) => ({
        ...prev,
        active: false,
        failures: [...failures],
      }));
      void loadNovels();

      if (failures.length > 0) {
        window.alert(
          `批量导入结束：成功 ${txtList.length - failures.length} 部，失败 ${failures.length} 部。失败原因见卡片下方列表。`,
        );
      }
    },
    [address, loadNovels, runSingleTxtImport],
  );

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
      const data = await readApiJsonSafe<{ snippet?: string; error?: string }>(res);
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
      const data = await readApiJsonSafe<{
        preferredLanguages?: string[];
        defaultTargetLanguage?: string;
        error?: string;
      }>(res);
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
      const data = await readApiJsonSafe<{
        sourceText?: string;
        translatedText?: string;
        model?: string;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "翻译失败");
      setTranslationSourcePreview((data.sourceText ?? "").slice(0, 120));
      const sourceText = data.sourceText ?? "";
      const translatedText = data.translatedText ?? "";
      setTranslationSourceFullText(sourceText);
      setTranslationOutputText(translatedText);
      setTranslationEngineModel(data.model ?? "");
      setTranslationProgress(100);
    } catch (e) {
      setTranslationError(e instanceof Error ? e.message : "翻译失败");
      setTranslationProgress(0);
    } finally {
      window.clearInterval(timer);
      setTranslationRunning(false);
    }
  };

  const handleApplyTranslationToCurrentChapter = useCallback(() => {
    if (!translationNovelId) {
      setTranslationError("请先选择小说");
      return;
    }
    const translatedText = translationOutputText.trim();
    if (!translatedText) {
      setTranslationError("请先生成或填写译文后再应用");
      return;
    }
    const sourceText =
      translationSourceFullText.trim() ||
      (translationSourceMode === "manual" ? translationManualText.trim() : "");
    if (typeof window === "undefined") return;
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
  }, [
    router,
    translationManualText,
    translationNovelId,
    translationOutputText,
    translationSourceFullText,
    translationSourceMode,
    translationTargetLanguage,
  ]);

  const translationSelectedPublishRow = useMemo(
    () => publishRows.find((row) => row.novelId === translationNovelId) ?? null,
    [publishRows, translationNovelId],
  );
  const translationCompareArticleId =
    translationSelectedPublishRow?.record?.articleId?.trim() ?? "";

  const unifiedWorkItems = useMemo<UnifiedWorkItem[]>(() => {
    const novelItems: UnifiedWorkItem[] = novels.map((novel) => ({
      kind: "novel",
      sortAt: novel.lastModified || novel.updatedAt || "",
      novel,
    }));
    const audiobookItems: UnifiedWorkItem[] = audiobooks.map((audiobook) => ({
      kind: "audiobook",
      sortAt: audiobook.updatedAt || audiobook.createdAt || "",
      audiobook,
    }));
    return [...novelItems, ...audiobookItems].sort((a, b) =>
      b.sortAt.localeCompare(a.sortAt),
    );
  }, [novels, audiobooks]);

  useEffect(() => {
    return () => {
      for (const u of ticketImagePreviewUrls) {
        URL.revokeObjectURL(u);
      }
    };
  }, [ticketImagePreviewUrls]);

  const handlePickTicketImages = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    setTicketImages((prev) => {
      const next = [...prev, ...incoming].slice(0, 8);
      return next;
    });
  };

  useEffect(() => {
    const urls = ticketImages.map((f) => URL.createObjectURL(f));
    setTicketImagePreviewUrls(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [ticketImages]);

  const uploadTicketImages = useCallback(async (): Promise<string[]> => {
    if (!address) return [];
    if (ticketImages.length === 0) return [];
    const form = new FormData();
    for (const f of ticketImages) form.append("files", f);
    const res = await fetch("/api/v1/image-host", {
      method: "POST",
      headers: {
        "x-wallet-address": address,
      },
      body: form,
    });
    const data = await readApiJsonSafe<{
      items?: Array<{ url?: string }>;
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(data.error ?? "上传工单图片失败");
    return (data.items ?? [])
      .map((x) => (typeof x.url === "string" ? x.url : ""))
      .filter(Boolean)
      .slice(0, 8);
  }, [address, ticketImages]);

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
      setTicketUploadingImages(true);
      const imageUrls = await uploadTicketImages();
      setTicketUploadingImages(false);
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify({ title, content, imageUrls }),
      });
      const data = await readApiJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "提交工单失败");
      setTicketTitle("");
      setTicketContent("");
      setTicketImages([]);
      await loadTickets();
    } catch (e) {
      setTicketUploadingImages(false);
      setTicketsError(e instanceof Error ? e.message : "提交工单失败");
    } finally {
      setTicketUploadingImages(false);
      setTicketSubmitting(false);
    }
  };

  const handleUploadAudiobookFiles = useCallback(
    async (list: FileList | null) => {
      if (!address || !list || list.length === 0 || audioUploading) return;
      const files = Array.from(list);
      const allowedExt = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);
      const invalid = files.find((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        const mime = (f.type || "").toLowerCase();
        if (mime.startsWith("audio/")) return false;
        return !allowedExt.has(ext);
      });
      if (invalid) {
        setAudioUploadError(`不支持的音频格式：${invalid.name}`);
        return;
      }

      setAudioUploading(true);
      setAudioUploadProgress(0);
      setAudioUploadError(null);
      try {
        const uploadOnce = async (url: string) => {
          const form = new FormData();
          form.append("authorId", address);
          form.append("novelId", audiobookNovelId);
          for (const f of files) {
            form.append("files", f);
          }
          const data = await new Promise<{ items?: UploadedAudioItem[]; error?: string }>(
            (resolve, reject) => {
              const xhr = new XMLHttpRequest();
              audioUploadXhrRef.current = xhr;
              xhr.open("POST", url);
              xhr.setRequestHeader("x-wallet-address", address);
              xhr.upload.onprogress = (event) => {
                if (!event.lengthComputable || event.total <= 0) return;
                const percent = Math.min(
                  100,
                  Math.max(0, Math.round((event.loaded / event.total) * 100)),
                );
                setAudioUploadProgress(percent);
              };
              xhr.onerror = () => reject(new Error("网络异常，音频上传失败"));
              xhr.onabort = () => reject(new Error("已取消上传"));
              xhr.onload = () => {
                if (audioUploadXhrRef.current === xhr) {
                  audioUploadXhrRef.current = null;
                }
                const raw = xhr.responseText ?? "";
                let parsed: { items?: UploadedAudioItem[]; error?: string } = {};
                if (raw.trim()) {
                  try {
                    parsed = JSON.parse(raw) as {
                      items?: UploadedAudioItem[];
                      error?: string;
                    };
                  } catch {
                    // Keep parsed as empty object; error will be based on HTTP status.
                  }
                }
                if (xhr.status < 200 || xhr.status >= 300) {
                  reject(
                    new Error(
                      parsed.error ?? `音频上传失败（${url}，HTTP ${xhr.status}）`,
                    ),
                  );
                  return;
                }
                resolve(parsed);
              };
              xhr.send(form);
            },
          );
          return data;
        };

        let data: { items?: Array<Record<string, unknown>>; error?: string };
        try {
          data = await uploadOnce("/api/v1/audiobooks");
        } catch (e) {
          const message = e instanceof Error ? e.message : "";
          if (message.includes("HTTP 404")) {
            data = await uploadOnce("/api/v1/audio-host");
          } else {
            throw e;
          }
        }
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0) throw new Error("未返回可用音频链接");
        const normalized: UploadedAudioItem[] = items
          .map((x) => {
            const url = typeof x.url === "string" ? x.url : "";
            const name =
              typeof x.name === "string"
                ? x.name
                : typeof x.fileName === "string"
                  ? x.fileName
                  : "";
            if (!url || !name) return null;
            return {
              name,
              url,
              size: typeof x.size === "number" ? x.size : 0,
              mimeType: typeof x.mimeType === "string" ? x.mimeType : "",
            };
          })
          .filter((x): x is UploadedAudioItem => Boolean(x));
        setUploadedAudios((prev) => [...normalized, ...prev].slice(0, 24));
        await loadAudiobooks();
        setAudioUploadProgress(100);
      } catch (e) {
        setAudioUploadError(e instanceof Error ? e.message : "音频上传失败");
        setAudioUploadProgress(0);
      } finally {
        audioUploadXhrRef.current = null;
        setAudioUploading(false);
      }
    },
    [address, audioUploading, audiobookNovelId, loadAudiobooks],
  );

  const handleCancelAudiobookUpload = useCallback(() => {
    const xhr = audioUploadXhrRef.current;
    if (!xhr || !audioUploading) return;
    xhr.abort();
    audioUploadXhrRef.current = null;
    setAudioUploading(false);
    setAudioUploadProgress(0);
    setAudioUploadError("已取消上传");
  }, [audioUploading]);

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
      const data = await readApiJsonSafe<{ error?: string }>(res);
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
          若本机曾连接过，刷新后会自动恢复会话（无需重复弹窗）。首次使用或恢复失败时，请点击下方按钮连接。
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex w-full flex-col items-start gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-left transition dark:border-neutral-600 dark:bg-neutral-900/50">
                <button
                  type="button"
                  onClick={openModal}
                  className="flex w-full cursor-pointer flex-col items-start gap-2 text-left transition hover:opacity-90"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
                    <Plus className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="text-lg font-semibold">新建小说</span>
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    创建一部新作品，填写标题与简介后即可进入编辑器
                  </span>
                </button>

                <div className="w-full border-t border-neutral-200 pt-4 dark:border-neutral-700">
                  <p className="mb-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    从 .txt 批量新建（静默后台切章）
                  </p>
                  <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
                    可多选 .txt：每份自动新建作品、正则切章并保存大纲与首章稿面；处理期间可继续浏览本页，完成后在下方「全部作品」查看。
                  </p>
                  <input
                    ref={novelTxtInputRef}
                    type="file"
                    accept={NOVEL_TXT_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleNovelTxtBatchSelected(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => novelTxtInputRef.current?.click()}
                    disabled={txtBatchImport.active}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-white/80 px-3 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500/40 dark:bg-cyan-950/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50"
                  >
                    <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {txtBatchImport.active
                      ? `后台处理中 ${txtBatchImport.done}/${txtBatchImport.total}…`
                      : "选择 .txt（可多选）"}
                  </button>
                  {txtBatchImport.active && txtBatchImport.total > 0 ? (
                    <div className="mt-2 w-full">
                      <div className="mb-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                        切章与保存均在后台顺序执行，请勿关闭页面直至进度走完
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                        <div
                          className="h-full bg-cyan-500 transition-[width] duration-300 dark:bg-cyan-400"
                          style={{
                            width: `${Math.min(100, Math.round((txtBatchImport.done / txtBatchImport.total) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {txtBatchImport.failures.length > 0 ? (
                    <ul className="mt-2 max-h-28 w-full space-y-1 overflow-y-auto rounded border border-rose-200/60 bg-rose-50/50 p-2 text-[11px] text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                      {txtBatchImport.failures.map((f, idx) => (
                        <li key={`${idx}-${f.name}`} className="break-words">
                          <span className="font-medium">{f.name}</span>：{f.error}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="flex w-full flex-col items-start gap-3 rounded-2xl border-2 border-dashed border-violet-400/40 bg-violet-50/40 p-8 text-left transition dark:bg-violet-950/20">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-200 text-violet-900 dark:bg-violet-900/60 dark:text-violet-100">
                  <Plus className="h-6 w-6" aria-hidden />
                </span>
                <span className="text-lg font-semibold">新建有声书</span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  上传音频文件创建有声书素材（支持 MP3/WAV/M4A/AAC/OGG/FLAC）
                </span>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept={AUDIO_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleUploadAudiobookFiles(e.currentTarget.files);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={audioUploading}
                  className="rounded-lg border border-violet-500/50 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {audioUploading ? "上传中…" : "选择并上传音频"}
                </button>
                {audioUploading ? (
                  <button
                    type="button"
                    onClick={handleCancelAudiobookUpload}
                    className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                  >
                    取消上传
                  </button>
                ) : null}
                {audioUploading || audioUploadProgress > 0 ? (
                  <div className="w-full">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>上传进度</span>
                      <span>{audioUploadProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-violet-200/50 dark:bg-violet-900/40">
                      <div
                        className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-500 transition-all"
                        style={{ width: `${audioUploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                {audioUploadError ? (
                  <p className="text-xs text-red-500 dark:text-red-400">{audioUploadError}</p>
                ) : null}
                {uploadedAudios.length > 0 ? (
                  <ul className="max-h-28 w-full space-y-1 overflow-y-auto text-xs text-zinc-500 dark:text-zinc-400">
                    {uploadedAudios.slice(0, 6).map((item) => (
                      <li key={`${item.url}-${item.name}`} className="truncate">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                          title={item.name}
                        >
                          {item.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                全部作品
              </h2>
              {loadingList || audiobooksLoading ? (
                <p className="text-sm text-neutral-500">加载中…</p>
              ) : unifiedWorkItems.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  暂无作品，可新建小说（含 .txt 批量导入）、或上传有声书。
                </p>
              ) : audiobooksError ? (
                <p className="text-sm text-rose-500 dark:text-rose-400">{audiobooksError}</p>
              ) : (
                <ul className="space-y-2">
                  {unifiedWorkItems.map((entry) =>
                    entry.kind === "novel" ? (
                      <li key={`novel-${entry.novel.id}`}>
                        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 transition hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:border-neutral-500">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <Link
                              href={`/editor/${encodeURIComponent(entry.novel.id)}`}
                              className="font-medium hover:underline"
                            >
                              {entry.novel.title}
                            </Link>
                            <div className="flex items-center gap-2">
                              <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                                {entry.novel.wordCount.toLocaleString("zh-CN")} 字
                                <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">
                                  ·
                                </span>
                                最后修改 {formatModified(entry.novel.lastModified)}
                              </span>
                              <button
                                type="button"
                                onClick={() => openEditModal(entry.novel)}
                                className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                              >
                                编辑
                              </button>
                            </div>
                          </div>
                          {entry.novel.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                              {entry.novel.description}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ) : (
                      <li key={`audiobook-${entry.audiobook.id}`}>
                        <div className="rounded-xl border border-violet-300/50 bg-violet-50/40 px-4 py-3 transition dark:border-violet-700/60 dark:bg-violet-950/20">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p
                              className="max-w-[70%] truncate text-sm font-medium text-violet-900 dark:text-violet-200"
                              title={entry.audiobook.displayName || entry.audiobook.fileName}
                            >
                              {entry.audiobook.displayName || entry.audiobook.fileName}
                            </p>
                            <span className="text-xs text-violet-700 dark:text-violet-300">
                              有声书
                            </span>
                          </div>
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => openAudiobookEditModal(entry.audiobook)}
                              className="rounded-md border border-violet-500/50 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
                            >
                              编辑
                            </button>
                          </div>
                          <p className="mt-1 truncate text-xs text-neutral-600 dark:text-neutral-400">
                            归档小说：
                            {entry.audiobook.novelId
                              ? novels.find((n) => n.id === entry.audiobook.novelId)?.title ??
                                entry.audiobook.novelId
                              : "未归档"}
                          </p>
                          {(entry.audiobook.synopsis ?? "").trim() ? (
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">
                              简介：{entry.audiobook.synopsis}
                            </p>
                          ) : null}
                          {(entry.audiobook.details ?? "").trim() ? (
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                              详情：{entry.audiobook.details}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            上传时间：{formatModified(entry.audiobook.updatedAt)}
                          </p>
                          <audio controls src={entry.audiobook.url} className="mt-2 w-full" />
                        </div>
                      </li>
                    ),
                  )}
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
                          {chapter.hasEnglishTranslation ? " · 已有英文翻译" : ""}
                        </option>
                      ))}
                    </select>
                    {translationChapters.length > 0 ? (
                      <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto rounded-md border border-[#324866] bg-[#0d1625] p-2">
                        {translationChapters.map((chapter) => (
                          <div
                            key={chapter.id}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <button
                              type="button"
                              onClick={() => setTranslationChapterId(chapter.id)}
                              className={
                                chapter.id === translationChapterId
                                  ? "truncate text-cyan-300"
                                  : "truncate text-zinc-300 hover:text-cyan-300"
                              }
                              title={chapter.title}
                            >
                              {chapter.title}
                            </button>
                            {chapter.hasEnglishTranslation ? (
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                  EN
                                </span>
                                {translationCompareArticleId ? (
                                  <a
                                    href={`/library/${encodeURIComponent(translationCompareArticleId)}?lang=en`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded border border-cyan-500/40 px-1.5 py-0.5 text-[10px] text-cyan-300 hover:bg-cyan-500/10"
                                    title="打开英文阅读页（可与原文页对比）"
                                  >
                                    对比入口
                                  </a>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {translationCompareArticleId ? (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        对比建议：打开原文
                        <a
                          href={`/library/${encodeURIComponent(translationCompareArticleId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mx-1 text-cyan-400 underline"
                        >
                          中文页
                        </a>
                        与英文页进行对照阅读。
                      </p>
                    ) : null}
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
                <button
                  type="button"
                  onClick={handleApplyTranslationToCurrentChapter}
                  disabled={!translationNovelId || !translationOutputText.trim()}
                  className="w-full rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  应用译文到当前章节
                </button>
                {translationEngineModel ? (
                  <p className="text-[11px] text-zinc-500">
                    翻译模型：{translationEngineModel}
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
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">问题截图（可选，最多 8 张）</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      handlePickTicketImages(e.target.files);
                      e.currentTarget.value = "";
                    }}
                    className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-xs text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-cyan-500/20 file:px-2 file:py-1 file:text-cyan-200"
                  />
                  {ticketImagePreviewUrls.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ticketImagePreviewUrls.map((url, idx) => (
                        <div key={url} className="relative">
                          <img
                            src={url}
                            alt={`工单截图 ${idx + 1}`}
                            className="h-16 w-16 rounded border border-[#324866] object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setTicketImages((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="absolute -right-1 -top-1 rounded-full border border-rose-400/60 bg-[#0d1625] px-1 text-[10px] text-rose-300"
                            title="移除图片"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateTicket()}
                  disabled={ticketSubmitting || ticketUploadingImages}
                  className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ticketUploadingImages
                    ? "上传图片中…"
                    : ticketSubmitting
                      ? "提交中…"
                      : "提交工单"}
                </button>
              </section>

              <section className="space-y-3 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {ticketIsAdmin ? "全部工单" : "我的工单"}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href="/workspace/tickets"
                      className="rounded border border-cyan-500/40 px-2.5 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10"
                    >
                      打开全部工单页面
                    </Link>
                    <button
                      type="button"
                      onClick={() => void loadTickets()}
                      disabled={ticketsLoading}
                      className="rounded border border-[#324866] px-2.5 py-1 text-xs text-zinc-300 hover:bg-[#0d1625] disabled:opacity-50"
                    >
                      刷新
                    </button>
                  </div>
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
                                  className="h-16 w-16 rounded border border-[#324866] object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        ) : null}
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

      {audiobookEditOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeAudiobookEditModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="编辑有声书信息"
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-[var(--background)] p-6 shadow-xl dark:border-neutral-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">编辑有声书信息</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  有声书标题
                </label>
                <input
                  type="text"
                  value={audiobookEditTitle}
                  onChange={(e) => setAudiobookEditTitle(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  placeholder="例如：第一章 有声版"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  简介
                </label>
                <textarea
                  value={audiobookEditSynopsis}
                  onChange={(e) => setAudiobookEditSynopsis(e.target.value)}
                  rows={3}
                  maxLength={20000}
                  className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  placeholder="简要介绍这条有声书内容"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  详情
                </label>
                <textarea
                  value={audiobookEditDetails}
                  onChange={(e) => setAudiobookEditDetails(e.target.value)}
                  rows={5}
                  maxLength={20000}
                  className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-950"
                  placeholder="补充备注、章节说明或运营信息"
                />
              </div>
              {audiobookEditError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{audiobookEditError}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAudiobookEditModal}
                disabled={audiobookEditSubmitting}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAudiobookEdit()}
                disabled={audiobookEditSubmitting}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {audiobookEditSubmitting ? "保存中…" : "保存修改"}
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
