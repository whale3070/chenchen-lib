"use client";

import { FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

import { PdfSignatureTool } from "@/components/pdf-signature-tool";
import { SiteLocaleControl } from "@/components/site-locale-control";
import { WalletConnect } from "@/components/wallet-connect";
import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";
import { WorkspaceClaudeChat } from "@/components/workspace-claude-chat";
import { useWeb3Auth } from "@/hooks/use-web3-auth";
import { useSiteLocale } from "@/providers/site-locale-provider";
import { useAuthStore } from "@/store/auth-store";
import { chapterizeTxtViaApi, decodeTxtAuto } from "@/lib/txt-import-chapterize";
import {
  derivePublishDisplayStatus,
  publishStatusLabelZh,
  type NovelPublishRecord,
} from "@/lib/novel-publish";
import { VIDEO_EXTRACT_CHUNK_BYTES } from "@/lib/video-extract-constants";

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
  | "video"
  | "pdfSign"
  | "translation"
  | "aiChat"
  | "analytics"
  | "tickets"
  | "adminMembers"
  | "settings";

const WORKSPACE_TAB_VALUES: Tab[] = [
  "novels",
  "audiobooks",
  "publish",
  "video",
  "pdfSign",
  "translation",
  "aiChat",
  "analytics",
  "tickets",
  "adminMembers",
  "settings",
];

function parseWorkspaceTabParam(raw: string | null): Tab | null {
  if (!raw || !WORKSPACE_TAB_VALUES.includes(raw as Tab)) return null;
  return raw as Tab;
}
type VideoMaterialId = "clean-carpet" | "cut-soap";
type VideoVoiceId = "gentle-female" | "warm-male" | "energetic-girl";
type TranslationSourceMode = "chapter" | "draft" | "manual";

type PublishRow = {
  novelId: string;
  novelTitle: string;
  record: NovelPublishRecord | null;
};

type ArticleUvStats = { uv7: number; uv30: number; today: number };

type ActiveUserAnalytics = {
  range: string;
  tz: string;
  summary: {
    dau: number;
    wau: number;
    mau: number;
  };
  series: Array<{
    date: string;
    activeUsers: number;
  }>;
  byEventType: Array<{
    eventType: string;
    users: number;
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

type VipMemberRow = {
  address: string;
  /** 邮箱注册作者时由服务端反查，纯钱包用户为 null */
  email?: string | null;
  record: {
    status: string;
    currentPeriodEnd: string;
    updatedAt?: string;
  };
  active: boolean;
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

type VideoExtractListItem = {
  id: string;
  sourceName: string;
  mp3Url: string;
  /** 服务端索引字段，用于转写等内部能力 */
  pathParam?: string;
  size: number;
  /** 上传的源文件大小（字节）；与 size（MP3）不同时列表会一并展示 */
  sourceSize?: number;
  createdAt: string;
  status?: "processing" | "ready" | "failed";
  processError?: string;
  pendingFileName?: string;
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
  { code: "ar", label: "阿拉伯语" },
  { code: "pt", label: "葡萄牙语" },
  { code: "it", label: "意大利语" },
  { code: "vi", label: "越南语" },
  { code: "th", label: "泰语" },
];

const TRANSLATION_LANG_LABELS_EN: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
  ar: "Arabic",
  pt: "Portuguese",
  it: "Italian",
  vi: "Vietnamese",
  th: "Thai",
};

function translationLangLabel(code: string, uiLocale: string): string {
  if (uiLocale === "zh-CN") {
    return TRANSLATION_LANGUAGES.find((l) => l.code === code)?.label ?? code;
  }
  return TRANSLATION_LANG_LABELS_EN[code] ?? code.toUpperCase();
}

type TranslationModelOptionRow = {
  value: string;
  provider: string;
  model: string;
};

function translationModelOptionLabel(
  opt: TranslationModelOptionRow,
  t: (key: string) => string,
): string {
  const key = `settings.translationModel.${opt.model}`;
  const specific = t(key);
  if (specific !== key) return specific;
  const providerLabel =
    opt.provider === "claude"
      ? t("settings.translationProviderClaude")
      : t("settings.translationProviderArk");
  return `${providerLabel}: ${opt.model}`;
}

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

/** 视频管理：MP4 抽轨；WAV/Opus/Ogg 转 MP3；MP3 直传 */
const VIDEO_UPLOAD_ACCEPT =
  "video/mp4,.mp4,audio/mpeg,.mp3,audio/wav,.wav,audio/x-wav,audio/wave,audio/opus,.opus,audio/ogg,.ogg,application/ogg";

/** 供 `x-upload-filename-b64`：UTF-8 文件名 → base64（与 extract 路由解码一致） */
function utf8FileNameToB64(name: string): string {
  const u8 = new TextEncoder().encode(name);
  let bin = "";
  for (let i = 0; i < u8.length; i += 1) {
    bin += String.fromCharCode(u8[i]!);
  }
  return btoa(bin);
}

function formatModified(iso: string, uiLocale: string) {
  try {
    return new Date(iso).toLocaleString(uiLocale, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    try {
      return new Date(iso).toLocaleString("en-US", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
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
    return {
      error: describeNonJsonHttpBody(res.status, raw),
    } as unknown as T;
  }
}

/** CDN / 网关常以 HTML 返回 524/502，JSON.parse 失败时需给用户可读说明 */
function describeNonJsonHttpBody(status: number, raw: string): string {
  const trimmed = raw.trimStart();
  const looksHtml =
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<html") ||
    trimmed.includes("<!DOCTYPE");

  if (status === 524) {
    return looksHtml
      ? "翻译网关超时（HTTP 524）：边缘节点在等待上游翻译接口返回时超时（常见于单章过长或单次请求耗时过久）。请稍后重试本章；若反复出现，可为正文增加段落空行以拆分翻译块，或由运维调高 CDN / 反代的读超时。"
      : `网关超时（HTTP 524）。请稍后重试；若正文较长可分段翻译。`;
  }
  if (status === 502 || status === 503) {
    return looksHtml
      ? `上游服务暂时不可用（HTTP ${status}），返回了网页错误页而非 JSON。请稍后重试。`
      : `上游错误（HTTP ${status}）。请稍后重试。`;
  }
  if (looksHtml) {
    return `服务器返回网页错误页而非 JSON（HTTP ${status}）。请稍后重试或检查网关配置。`;
  }
  const snippet = raw.replace(/\s+/g, " ").slice(0, 160);
  return `接口返回非 JSON（HTTP ${status}）${snippet ? `：${snippet}` : ""}`;
}

export function AuthorDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, isConnectPending } = useWeb3Auth();
  const authorId = useAuthStore((s) => s.authorId);
  const sessionResolved = useAuthStore((s) => s.sessionResolved);
  const { t, locale } = useSiteLocale();

  const [tab, setTabState] = useState<Tab>(
    () => parseWorkspaceTabParam(searchParams.get("tab")) ?? "novels",
  );

  const setTab = useCallback(
    (next: Tab | ((prev: Tab) => Tab)) => {
      setTabState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: Tab) => Tab)(prev) : next;
        router.replace(`/workspace?tab=${encodeURIComponent(resolved)}`, { scroll: false });
        return resolved;
      });
    },
    [router],
  );

  useEffect(() => {
    const q = parseWorkspaceTabParam(searchParams.get("tab"));
    if (q) {
      setTabState((prev) => (q !== prev ? q : prev));
    }
  }, [searchParams]);
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
  const [articleUvByArticleId, setArticleUvByArticleId] = useState<
    Record<string, ArticleUvStats>
  >({});
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
  const [translationPreferenceModel, setTranslationPreferenceModel] = useState("");
  const [translationModelOptions, setTranslationModelOptions] = useState<
    TranslationModelOptionRow[]
  >([]);
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
      translatedLangs: string[];
    }>
  >([]);
  const [novelTranslatedLanguages, setNovelTranslatedLanguages] = useState<string[]>(
    [],
  );
  const [translationPreviewChapterId, setTranslationPreviewChapterId] =
    useState("");
  const [translationPreviewLang, setTranslationPreviewLang] = useState("");
  const [translationPreviewText, setTranslationPreviewText] = useState("");
  const [translationPreviewUpdatedAt, setTranslationPreviewUpdatedAt] = useState<
    string | null
  >(null);
  const [translationPreviewLoading, setTranslationPreviewLoading] = useState(false);
  const [translationPreviewError, setTranslationPreviewError] = useState<string | null>(
    null,
  );
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
  const [translationBatchRunning, setTranslationBatchRunning] = useState(false);
  const [translationBatchDetail, setTranslationBatchDetail] = useState("");
  const [translationSkipExistingTargetLang, setTranslationSkipExistingTargetLang] =
    useState(true);
  const translationBatchAbortRef = useRef<AbortController | null>(null);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d" | "90d">(
    "30d",
  );
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<ActiveUserAnalytics | null>(
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
  const [vipAdmin, setVipAdmin] = useState<boolean | null>(null);
  const [vipMembers, setVipMembers] = useState<VipMemberRow[]>([]);
  const [vipLoading, setVipLoading] = useState(false);
  const [vipError, setVipError] = useState<string | null>(null);
  const [vipGrantWallet, setVipGrantWallet] = useState("");
  const [vipGrantDays, setVipGrantDays] = useState(30);
  const [vipSubmitting, setVipSubmitting] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudioItem[]>([]);
  const [audiobooks, setAudiobooks] = useState<AudiobookItem[]>([]);
  const [audiobooksLoading, setAudiobooksLoading] = useState(false);
  const [audiobooksError, setAudiobooksError] = useState<string | null>(null);
  const [audiobookNovelId, setAudiobookNovelId] = useState("");
  const [videoExtractItems, setVideoExtractItems] = useState<VideoExtractListItem[]>([]);
  const [videoExtractLoading, setVideoExtractLoading] = useState(false);
  const [videoExtractError, setVideoExtractError] = useState<string | null>(null);
  const [videoExtractUploading, setVideoExtractUploading] = useState(false);
  const [videoExtractUploadError, setVideoExtractUploadError] = useState<string | null>(null);
  const [videoAssocNovelId, setVideoAssocNovelId] = useState("");
  const [videoAssocChapterId, setVideoAssocChapterId] = useState("");
  const [videoAssocChapters, setVideoAssocChapters] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [videoAssocChaptersLoading, setVideoAssocChaptersLoading] = useState(false);
  const [videoAssocLinkingId, setVideoAssocLinkingId] = useState<string | null>(null);
  const [videoExtractDeletingId, setVideoExtractDeletingId] = useState<string | null>(null);
  const [videoAssocMessage, setVideoAssocMessage] = useState<string | null>(null);
  const [videoCardPanelById, setVideoCardPanelById] = useState<
    Record<string, "audio" | "transcript">
  >({});
  const [videoTranscriptById, setVideoTranscriptById] = useState<Record<string, string>>({});
  const [videoTranscribingId, setVideoTranscribingId] = useState<string | null>(null);
  const [videoTranscribeErrorById, setVideoTranscribeErrorById] = useState<Record<string, string>>(
    {},
  );
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
  const videoMp4InputRef = useRef<HTMLInputElement | null>(null);
  const authorDashboardMountedRef = useRef(true);

  useEffect(() => {
    authorDashboardMountedRef.current = true;
    return () => {
      authorDashboardMountedRef.current = false;
    };
  }, []);

  /**
   * 不在此自动 requestConnect。刷新后由 wagmi（localStorage + reconnectOnMount）静默恢复会话，
   * 避免每次 F5 都弹出 MetaMask。仅当用户点击「连接钱包」或首页主动连接时才唤起扩展。
   */

  const loadNovels = useCallback(async () => {
    if (!authorId) return;
    setLoadingList(true);
    try {
      const res = await fetch(
        `/api/v1/novels?authorId=${encodeURIComponent(authorId)}`,
        {
          headers: { "x-wallet-address": authorId },
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
  }, [authorId]);

  const loadPublishOverview = useCallback(async () => {
    if (!authorId) return;
    setLoadingPublish(true);
    try {
      const res = await fetch(
        `/api/v1/novel-publish?authorId=${encodeURIComponent(authorId)}`,
        { headers: { "x-wallet-address": authorId } },
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
  }, [authorId]);

  const loadArticleUvStats = useCallback(async () => {
    if (!authorId) return;
    const ids = publishRows
      .map((r) => (r.record?.articleId ?? "").trim().toLowerCase())
      .filter((id) => /^art_[0-9a-f]{10}$/.test(id));
    if (ids.length === 0) {
      setArticleUvByArticleId({});
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/analytics/article-uv-summary?articleIds=${encodeURIComponent(ids.join(","))}`,
        { headers: { "x-wallet-address": authorId } },
      );
      const data = await readApiJsonSafe<{
        byArticleId?: Record<string, ArticleUvStats>;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setArticleUvByArticleId(data.byArticleId ?? {});
    } catch {
      setArticleUvByArticleId({});
    }
  }, [authorId, publishRows]);

  const loadTranslationPreferences = useCallback(async () => {
    if (!authorId) return;
    setPrefsLoading(true);
    try {
      const res = await fetch(
        `/api/v1/novel-translation/preferences?authorId=${encodeURIComponent(authorId)}`,
        {
          headers: { "x-wallet-address": authorId },
        },
      );
      const data = await readApiJsonSafe<{
        preferredLanguages?: string[];
        defaultTargetLanguage?: string;
        translationModel?: string;
        translationModelOptions?: TranslationModelOptionRow[];
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
      const opts = Array.isArray(data.translationModelOptions)
        ? data.translationModelOptions.filter(
            (o): o is TranslationModelOptionRow =>
              Boolean(
                o &&
                  typeof o === "object" &&
                  typeof o.value === "string" &&
                  typeof o.model === "string" &&
                  typeof o.provider === "string",
              ),
          )
        : [];
      setTranslationModelOptions(opts);
      const tmRaw =
        typeof data.translationModel === "string" ? data.translationModel.trim() : "";
      const tm =
        tmRaw && opts.some((o) => o.value === tmRaw)
          ? tmRaw
          : opts[0]?.value ?? "";
      setTranslationPreferenceModel(tm);
      const resolvedTm = tm || opts[0]?.value || "";
      const preferredOpt = opts.find((o) => o.value === resolvedTm);
      setTranslationEngineModel(preferredOpt?.model ?? "");
    } catch (e) {
      console.error(e);
    } finally {
      setPrefsLoading(false);
    }
  }, [authorId]);

  const loadTranslationSources = useCallback(
    async (novelId: string) => {
      if (!authorId || !novelId) return;
      setTranslationLoadingSources(true);
      setTranslationError(null);
      try {
        const res = await fetch(
          `/api/v1/novel-translation/sources?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          {
            headers: { "x-wallet-address": authorId },
          },
        );
        const data = await readApiJsonSafe<{
          chapters?: Array<{
            id: string;
            title: string;
            preview: string;
            isPublished: boolean;
            hasEnglishTranslation?: boolean;
            translatedLangs?: string[];
          }>;
          hasDraft?: boolean;
          novelTranslatedLanguages?: string[];
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error ?? "加载章节失败");
        const chapters = (data.chapters ?? []).map((x) => ({
          ...x,
          hasEnglishTranslation: x.hasEnglishTranslation === true,
          translatedLangs: Array.isArray(x.translatedLangs) ? x.translatedLangs : [],
        }));
        const unionFromChapters = [...new Set(chapters.flatMap((c) => c.translatedLangs))].sort();
        setNovelTranslatedLanguages(
          Array.isArray(data.novelTranslatedLanguages) &&
            data.novelTranslatedLanguages.length > 0
            ? [...data.novelTranslatedLanguages].sort()
            : unionFromChapters,
        );
        setTranslationChapters(chapters);
        setTranslationHasDraft(Boolean(data.hasDraft));
        const first = chapters[0];
        setTranslationChapterId((prev) => prev || first?.id || "");
        if (first?.preview) setTranslationSourcePreview(first.preview);
        const firstWith = chapters.find((c) => c.translatedLangs.length > 0);
        setTranslationPreviewChapterId(firstWith?.id ?? first?.id ?? "");
        setTranslationPreviewLang(firstWith?.translatedLangs[0] ?? "");
      } catch (e) {
        setTranslationChapters([]);
        setTranslationHasDraft(false);
        setNovelTranslatedLanguages([]);
        setTranslationPreviewChapterId("");
        setTranslationPreviewLang("");
        setTranslationPreviewText("");
        setTranslationPreviewUpdatedAt(null);
        setTranslationError(e instanceof Error ? e.message : "加载章节失败");
      } finally {
        setTranslationLoadingSources(false);
      }
    },
    [authorId],
  );

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(
        `/api/v1/analytics/active-users?range=${encodeURIComponent(analyticsRange)}&groupBy=day&tz=${encodeURIComponent("Asia/Shanghai")}`,
        { cache: "no-store" },
      );
      const data = await readApiJsonSafe<
        ActiveUserAnalytics & {
        error?: string;
        }
      >(res);
      if (!res.ok) throw new Error(data.error ?? "加载活跃用户数据失败");
      setAnalyticsData(data);
    } catch (e) {
      setAnalyticsData(null);
      setAnalyticsError(e instanceof Error ? e.message : "加载活跃用户数据失败");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsRange]);

  const loadTickets = useCallback(async () => {
    if (!authorId) return;
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const res = await fetch("/api/v1/tickets", {
        headers: { "x-wallet-address": authorId },
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
  }, [authorId]);

  const loadVipMembers = useCallback(async () => {
    if (!authorId) return;
    setVipLoading(true);
    setVipError(null);
    try {
      const res = await fetch("/api/v1/admin/members", {
        headers: { "x-wallet-address": authorId },
        cache: "no-store",
      });
      const data = await readApiJsonSafe<{
        isAdmin?: boolean;
        items?: VipMemberRow[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "加载会员列表失败");
      setVipAdmin(data.isAdmin === true);
      setVipMembers(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setVipMembers([]);
      setVipAdmin(false);
      setVipError(e instanceof Error ? e.message : "加载会员列表失败");
    } finally {
      setVipLoading(false);
    }
  }, [authorId]);

  const handleVipGrant = useCallback(async () => {
    if (!authorId || !vipGrantWallet.trim()) return;
    setVipSubmitting(true);
    setVipError(null);
    try {
      const res = await fetch("/api/v1/admin/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify(
          vipGrantWallet.trim().includes("@")
            ? {
                action: "grant" as const,
                email: vipGrantWallet.trim(),
                extendDays: vipGrantDays,
              }
            : {
                action: "grant" as const,
                wallet: vipGrantWallet.trim(),
                extendDays: vipGrantDays,
              },
        ),
      });
      const data = await readApiJsonSafe<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      setVipGrantWallet("");
      await loadVipMembers();
    } catch (e) {
      setVipError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setVipSubmitting(false);
    }
  }, [authorId, vipGrantWallet, vipGrantDays, loadVipMembers]);

  const handleVipRevoke = useCallback(
    async (wallet: string) => {
      if (!authorId) return;
      if (!window.confirm(`确定撤销该地址的 VIP？\n${wallet}`)) return;
      setVipSubmitting(true);
      setVipError(null);
      try {
        const res = await fetch("/api/v1/admin/members", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({ action: "revoke", wallet }),
        });
        const data = await readApiJsonSafe<{ ok?: boolean; error?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "操作失败");
        await loadVipMembers();
      } catch (e) {
        setVipError(e instanceof Error ? e.message : "操作失败");
      } finally {
        setVipSubmitting(false);
      }
    },
    [authorId, loadVipMembers],
  );

  const loadAudiobooks = useCallback(async () => {
    if (!authorId) return;
    setAudiobooksLoading(true);
    setAudiobooksError(null);
    try {
      const res = await fetch(
        `/api/v1/audiobooks?authorId=${encodeURIComponent(authorId)}`,
        {
          headers: { "x-wallet-address": authorId },
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
  }, [authorId]);

  const loadVideoExtracts = useCallback(async () => {
    if (!authorId) return;
    setVideoExtractLoading(true);
    setVideoExtractError(null);
    try {
      const res = await fetch("/api/v1/video/extract", {
        headers: { "x-wallet-address": authorId },
        cache: "no-store",
      });
      const data = await readApiJsonSafe<{
        items?: VideoExtractListItem[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setVideoExtractItems(data.items ?? []);
    } catch (e) {
      setVideoExtractItems([]);
      setVideoExtractError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setVideoExtractLoading(false);
    }
  }, [authorId]);

  const loadVideoAssocChapters = useCallback(
    async (novelId: string) => {
      if (!authorId || !novelId) return;
      setVideoAssocChaptersLoading(true);
      try {
        const res = await fetch(
          `/api/v1/novel-translation/sources?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          { headers: { "x-wallet-address": authorId } },
        );
        const data = await readApiJsonSafe<{
          chapters?: Array<{ id: string; title: string }>;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error ?? "加载章节失败");
        const ch = (data.chapters ?? []).map((c) => ({
          id: c.id,
          title: c.title,
        }));
        setVideoAssocChapters(ch);
        setVideoAssocChapterId((prev) => {
          if (prev && ch.some((x) => x.id === prev)) return prev;
          return ch[0]?.id ?? "";
        });
      } catch {
        setVideoAssocChapters([]);
        setVideoAssocChapterId("");
      } finally {
        setVideoAssocChaptersLoading(false);
      }
    },
    [authorId],
  );

  useEffect(() => {
    if (tab === "novels" && authorId) void loadNovels();
  }, [tab, authorId, loadNovels]);

  useEffect(() => {
    if (tab === "novels" && authorId) void loadAudiobooks();
  }, [tab, authorId, loadAudiobooks]);

  useEffect(() => {
    if ((tab === "publish" || tab === "translation" || tab === "video") && authorId) {
      void loadPublishOverview();
    }
  }, [tab, authorId, loadPublishOverview]);

  useEffect(() => {
    if (tab !== "publish" || !authorId || loadingPublish) return;
    void loadArticleUvStats();
  }, [tab, authorId, loadingPublish, loadArticleUvStats]);

  useEffect(() => {
    if (tab !== "video" || !authorId) return;
    void loadVideoExtracts();
  }, [tab, authorId, loadVideoExtracts]);

  useEffect(() => {
    if (tab !== "video") return;
    if (videoAssocNovelId) {
      void loadVideoAssocChapters(videoAssocNovelId);
    } else {
      setVideoAssocChapters([]);
      setVideoAssocChapterId("");
    }
  }, [tab, videoAssocNovelId, loadVideoAssocChapters]);

  useEffect(() => {
    if (tab !== "video") return;
    if (videoAssocNovelId) return;
    const first = publishRows[0]?.novelId;
    if (first) setVideoAssocNovelId(first);
  }, [tab, videoAssocNovelId, publishRows]);

  useEffect(() => {
    if (tab !== "analytics") return;
    void loadAnalytics();
  }, [tab, loadAnalytics]);

  useEffect(() => {
    if (tab !== "tickets") return;
    void loadTickets();
  }, [tab, loadTickets]);

  useEffect(() => {
    if (!authorId) {
      setVipAdmin(null);
      setVipMembers([]);
      return;
    }
    void loadVipMembers();
  }, [authorId, loadVipMembers]);

  useEffect(() => {
    if (tab !== "adminMembers") return;
    void loadVipMembers();
  }, [tab, loadVipMembers]);

  useEffect(() => {
    if (vipAdmin === false && tab === "adminMembers") {
      setTab("novels");
    }
  }, [vipAdmin, tab]);

  useEffect(() => {
    if (!authorId) return;
    void loadTranslationPreferences();
  }, [authorId, loadTranslationPreferences]);

  useEffect(() => {
    if (publishRows.length === 0) return;
    if (translationNovelId) return;
    const preferred =
      publishRows.find((r) => derivePublishDisplayStatus(r.record) !== "draft") ??
      publishRows[0];
    setTranslationNovelId(preferred.novelId);
  }, [publishRows, translationNovelId]);

  useEffect(() => {
    if (!translationNovelId) {
      setTranslationChapters([]);
      setTranslationHasDraft(false);
      setNovelTranslatedLanguages([]);
      setTranslationPreviewChapterId("");
      setTranslationPreviewLang("");
      setTranslationPreviewText("");
      setTranslationPreviewUpdatedAt(null);
      setTranslationPreviewError(null);
      return;
    }
    void loadTranslationSources(translationNovelId);
  }, [translationNovelId, loadTranslationSources]);

  useEffect(() => {
    if (!authorId || !translationNovelId || !translationPreviewChapterId || !translationPreviewLang) {
      setTranslationPreviewText("");
      setTranslationPreviewUpdatedAt(null);
      setTranslationPreviewLoading(false);
      setTranslationPreviewError(null);
      return;
    }
    const ac = new AbortController();
    setTranslationPreviewLoading(true);
    setTranslationPreviewError(null);
    void (async () => {
      try {
        const qs = new URLSearchParams({
          authorId: authorId,
          novelId: translationNovelId,
          chapterId: translationPreviewChapterId,
          lang: translationPreviewLang,
        });
        const res = await fetch(`/api/v1/novel-translation/chapter-preview?${qs}`, {
          headers: { "x-wallet-address": authorId },
          signal: ac.signal,
        });
        const data = await readApiJsonSafe<{
          translatedText?: string;
          updatedAt?: string | null;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error ?? "加载预览失败");
        setTranslationPreviewText(
          typeof data.translatedText === "string" ? data.translatedText : "",
        );
        setTranslationPreviewUpdatedAt(
          typeof data.updatedAt === "string" ? data.updatedAt : null,
        );
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setTranslationPreviewText("");
        setTranslationPreviewUpdatedAt(null);
        setTranslationPreviewError(e instanceof Error ? e.message : "加载预览失败");
      } finally {
        if (!ac.signal.aborted) setTranslationPreviewLoading(false);
      }
    })();
    return () => ac.abort();
  }, [authorId, translationNovelId, translationPreviewChapterId, translationPreviewLang]);

  useEffect(() => {
    if (!translationPreviewChapterId || translationChapters.length === 0) return;
    const ch = translationChapters.find((c) => c.id === translationPreviewChapterId);
    const langs = ch?.translatedLangs ?? [];
    if (langs.length === 0) {
      if (translationPreviewLang) setTranslationPreviewLang("");
      return;
    }
    if (!langs.includes(translationPreviewLang)) {
      setTranslationPreviewLang(langs[0] ?? "");
    }
  }, [
    translationPreviewChapterId,
    translationChapters,
    translationPreviewLang,
  ]);

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
    if (!authorId) return;
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
    if (!authorId || !editingNovelId) return;
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
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId: authorId,
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
    if (!authorId || !editingAudiobookId) return;
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
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId: authorId,
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
    if (!authorId) return;
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
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId: authorId,
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
        { walletAddress: wallet },
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
      if (!authorId || !files || files.length === 0) return;
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
          await runSingleTxtImport(file, authorId);
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
    [authorId, loadNovels, runSingleTxtImport],
  );

  const handleVideoMp4Selected = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f || !authorId) return;
      setVideoExtractUploading(true);
      setVideoExtractUploadError(null);
      try {
        const pollExtractJob = (extractId: string, sourceName: string) => {
          void (async () => {
            const intervalMs = 2000;
            const maxRounds = 1800;
            for (let i = 0; i < maxRounds; i++) {
              await new Promise((r) => setTimeout(r, intervalMs));
              if (!authorDashboardMountedRef.current) return;
              try {
                const pollRes = await fetch("/api/v1/video/extract", {
                  headers: { "x-wallet-address": authorId },
                });
                const pollData = await readApiJsonSafe<{
                  items?: VideoExtractListItem[];
                }>(pollRes);
                if (!pollRes.ok) continue;
                const list = pollData.items ?? [];
                const latest = list.find((x) => x.id === extractId);
                if (!latest) return;
                setVideoExtractItems((prev) =>
                  prev.map((x) => (x.id === extractId ? latest : x)),
                );
                if (latest.status === "ready" || (!latest.status && latest.mp3Url)) {
                  if (authorDashboardMountedRef.current) {
                    window.alert(`「${sourceName}」后台转码完成，已生成 MP3。`);
                  }
                  return;
                }
                if (latest.status === "failed") {
                  if (authorDashboardMountedRef.current) {
                    window.alert(
                      `「${sourceName}」转码失败：${latest.processError ?? "未知错误"}`,
                    );
                  }
                  return;
                }
              } catch {
                /* 单次轮询失败则继续 */
              }
            }
            if (authorDashboardMountedRef.current) {
              window.alert(
                `「${sourceName}」长时间未收到转码完成状态，请稍后刷新列表或联系管理员查看服务日志。`,
              );
            }
          })();
        };

        const isLikelyMp3 =
          f.name.toLowerCase().endsWith(".mp3") ||
          (f.type || "").toLowerCase().includes("mpeg");

        const optRes = await fetch("/api/v1/video/extract/upload-options", {
          headers: { "x-wallet-address": authorId },
          cache: "no-store",
        });
        const optData = await readApiJsonSafe<{ directObjectStorage?: boolean }>(optRes);
        const useObjectStorage = optRes.ok && optData.directObjectStorage === true;

        /** 服务端配置 S3/R2 时：浏览器 PUT 直传桶，再由服务端拉取转码，不经反代大 body */
        if (useObjectStorage && !isLikelyMp3) {
          const mime = f.type || "application/octet-stream";
          const preRes = await fetch("/api/v1/video/extract/presign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": authorId,
            },
            body: JSON.stringify({ fileName: f.name, totalSize: f.size, mime }),
          });
          const preData = await readApiJsonSafe<{
            uploadId?: string;
            putUrl?: string;
            contentType?: string;
            hint?: string;
            error?: string;
          }>(preRes);
          if (!preRes.ok) {
            throw new Error(
              preData.error ??
                (preRes.status === 503
                  ? "对象存储未配置，已回退失败；请改用分片或单次上传，或联系管理员配置 VIDEO_EXTRACT_S3_*。"
                  : `预签名失败（HTTP ${preRes.status}）`),
            );
          }
          const putUrl = preData.putUrl;
          const uploadId = preData.uploadId;
          const contentType =
            preData.contentType ?? (mime.split(";")[0]?.trim() || "application/octet-stream");
          if (!putUrl || !uploadId) throw new Error("预签名响应不完整");

          const putRes = await fetch(putUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: f,
          });
          if (!putRes.ok) {
            const tail = (await putRes.text().catch(() => "")).trim().slice(0, 240);
            throw new Error(
              `对象存储上传失败（HTTP ${putRes.status}）${tail ? `：${tail}` : ""}。${preData.hint ?? "请检查桶 CORS（允许本站 PUT、Content-Type、Content-Length）。"}`,
            );
          }

          const fsRes = await fetch("/api/v1/video/extract/from-storage", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": authorId,
            },
            body: JSON.stringify({ uploadId }),
          });
          const fsData = await readApiJsonSafe<{
            item?: VideoExtractListItem;
            error?: string;
            asyncAccepted?: boolean;
          }>(fsRes);
          if (!fsRes.ok) {
            throw new Error(fsData.error ?? `入库失败（HTTP ${fsRes.status}）`);
          }
          if (fsData.item) setVideoExtractItems((prev) => [fsData.item!, ...prev]);
          if (fsData.asyncAccepted && fsData.item?.id) {
            pollExtractJob(fsData.item.id, fsData.item.sourceName);
          }
          return;
        }

        /** 大于单片上限时用分片上传，减轻反代对单次 POST 体大小的限制（如 10MB）；MP3 直存仍走单次上传 */
        if (f.size > VIDEO_EXTRACT_CHUNK_BYTES && !isLikelyMp3) {
          const mime = f.type || "application/octet-stream";
          const initRes = await fetch("/api/v1/video/extract/chunk-session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": authorId,
            },
            body: JSON.stringify({ fileName: f.name, totalSize: f.size, mime }),
          });
          const initData = await readApiJsonSafe<{
            uploadId?: string;
            chunkSize?: number;
            totalChunks?: number;
            error?: string;
          }>(initRes);
          if (!initRes.ok) {
            throw new Error(initData.error ?? `分片会话失败（HTTP ${initRes.status}）`);
          }
          const uploadId = initData.uploadId;
          const chunkSize = initData.chunkSize ?? VIDEO_EXTRACT_CHUNK_BYTES;
          const totalChunks = initData.totalChunks ?? Math.ceil(f.size / chunkSize);
          if (!uploadId) throw new Error("服务端未返回 uploadId");

          for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, f.size);
            const slice = f.slice(start, end);
            const chunkBuf = await slice.arrayBuffer();
            const chunkRes = await fetch("/api/v1/video/extract/chunk", {
              method: "POST",
              headers: {
                "x-wallet-address": authorId,
                "Content-Type": "application/octet-stream",
                "x-chunk-upload-id": uploadId,
                "x-chunk-index": String(i),
                "x-chunk-byte-length": String(chunkBuf.byteLength),
              },
              body: chunkBuf,
            });
            const cData = await readApiJsonSafe<{ error?: string }>(chunkRes);
            if (!chunkRes.ok) {
              throw new Error(
                cData.error ?? `分片 ${i + 1}/${totalChunks} 上传失败（HTTP ${chunkRes.status}）`,
              );
            }
          }

          const commitRes = await fetch("/api/v1/video/extract/chunk-commit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": authorId,
            },
            body: JSON.stringify({ uploadId }),
          });
          const commitData = await readApiJsonSafe<{
            item?: VideoExtractListItem;
            error?: string;
            asyncAccepted?: boolean;
          }>(commitRes);
          if (!commitRes.ok) {
            throw new Error(commitData.error ?? `合并失败（HTTP ${commitRes.status}）`);
          }
          if (commitData.item) setVideoExtractItems((prev) => [commitData.item!, ...prev]);
          if (commitData.asyncAccepted && commitData.item?.id) {
            pollExtractJob(commitData.item.id, commitData.item.sourceName);
          }
          return;
        }

        /** 使用 octet-stream 直传，避免 multipart 在 Next/Undici 下解析失败（Unexpected end of form） */
        const bodyBuf = await f.arrayBuffer();
        const res = await fetch("/api/v1/video/extract", {
          method: "POST",
          headers: {
            "x-wallet-address": authorId,
            "Content-Type": "application/octet-stream",
            "x-upload-filename-b64": utf8FileNameToB64(f.name),
            "x-upload-mime": f.type || "application/octet-stream",
            /** 与服务端比对，检测反代 client_max_body_size 等导致的静默截断 */
            "x-upload-byte-length": String(f.size),
          },
          body: bodyBuf,
        });
        const data = await readApiJsonSafe<{
          item?: VideoExtractListItem;
          error?: string;
          detail?: string;
          hint?: string;
          asyncAccepted?: boolean;
        }>(res);
        if (!res.ok) {
          if (res.status === 408) {
            throw new Error(
              "请求超时（408）：上传慢或网络不稳时，请在反代调高 client_body_timeout；或换较小文件再试。",
            );
          }
          const base = data.error ?? `上传失败（HTTP ${res.status}）`;
          const extra: string[] = [];
          if (typeof data.detail === "string" && data.detail.trim()) {
            extra.push(`详情：${data.detail.trim()}`);
          }
          if (typeof data.hint === "string" && data.hint.trim()) {
            extra.push(data.hint.trim());
          }
          throw new Error(extra.length > 0 ? `${base} ${extra.join(" ")}` : base);
        }
        if (data.item) setVideoExtractItems((prev) => [data.item!, ...prev]);

        if (data.asyncAccepted && data.item?.id) {
          pollExtractJob(data.item.id, data.item.sourceName);
        }
      } catch (e) {
        setVideoExtractUploadError(e instanceof Error ? e.message : "上传失败");
      } finally {
        setVideoExtractUploading(false);
      }
    },
    [authorId],
  );

  const linkExtractToChapter = useCallback(
    async (mp3Url: string, extractId: string) => {
      if (!authorId || !videoAssocNovelId || !videoAssocChapterId) {
        window.alert("请先选择小说与章节");
        return;
      }
      setVideoAssocLinkingId(extractId);
      setVideoAssocMessage(null);
      try {
        const res = await fetch("/api/v1/novel-publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({
            action: "set_chapter_narration_audio",
            authorId: authorId,
            novelId: videoAssocNovelId,
            chapterId: videoAssocChapterId,
            audioUrl: mp3Url,
          }),
        });
        const data = await readApiJsonSafe<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "关联失败");
        setVideoAssocMessage("已关联到当前所选章节；读者在书库该书的「朗读」页可播放此 MP3。");
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "关联失败");
      } finally {
        setVideoAssocLinkingId(null);
      }
    },
    [authorId, videoAssocNovelId, videoAssocChapterId],
  );

  const transcribeVideoExtract = useCallback(
    async (extractId: string) => {
      if (!authorId) return;
      setVideoTranscribingId(extractId);
      setVideoTranscribeErrorById((prev) => {
        const next = { ...prev };
        delete next[extractId];
        return next;
      });
      try {
        const res = await fetch("/api/v1/video/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({ extractId }),
        });
        const data = await readApiJsonSafe<{ text?: string; error?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "语音转文字失败");
        const text = typeof data.text === "string" ? data.text : "";
        setVideoTranscriptById((prev) => ({ ...prev, [extractId]: text }));
      } catch (e) {
        setVideoTranscribeErrorById((prev) => ({
          ...prev,
          [extractId]: e instanceof Error ? e.message : "语音转文字失败",
        }));
      } finally {
        setVideoTranscribingId(null);
      }
    },
    [authorId],
  );

  const deleteVideoExtract = useCallback(
    async (extractId: string) => {
      if (!authorId) return;
      if (
        !window.confirm(
          "确定删除这条 MP3 吗？将移除工作台记录并删除服务器上的音频文件；若已关联到某章节，读者端「朗读」可能失效，需重新上传或关联。",
        )
      ) {
        return;
      }
      setVideoExtractDeletingId(extractId);
      try {
        const res = await fetch(
          `/api/v1/video/extract?extractId=${encodeURIComponent(extractId)}`,
          {
            method: "DELETE",
            headers: { "x-wallet-address": authorId },
          },
        );
        const data = await readApiJsonSafe<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "删除失败");
        setVideoExtractItems((prev) => prev.filter((x) => x.id !== extractId));
        setVideoCardPanelById((prev) => {
          const next = { ...prev };
          delete next[extractId];
          return next;
        });
        setVideoTranscriptById((prev) => {
          const next = { ...prev };
          delete next[extractId];
          return next;
        });
        setVideoTranscribeErrorById((prev) => {
          const next = { ...prev };
          delete next[extractId];
          return next;
        });
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "删除失败");
      } finally {
        setVideoExtractDeletingId(null);
      }
    },
    [authorId],
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
    if (!authorId) return;
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
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId: authorId,
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
    if (!authorId) return;
    setSavingPrefs(true);
    setPrefsMessage(null);
    try {
      const res = await fetch("/api/v1/novel-translation/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId: authorId,
          preferredLanguages: preferredTranslationLanguages,
          defaultTargetLanguage: defaultTranslationLanguage,
          translationModel: translationPreferenceModel,
        }),
      });
      const data = await readApiJsonSafe<{
        preferredLanguages?: string[];
        defaultTargetLanguage?: string;
        translationModel?: string;
        translationModelOptions?: TranslationModelOptionRow[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? t("settings.saveFailed"));
      const preferred =
        data.preferredLanguages && data.preferredLanguages.length > 0
          ? data.preferredLanguages
          : preferredTranslationLanguages;
      const defaultLang = data.defaultTargetLanguage || preferred[0] || "en";
      setPreferredTranslationLanguages(preferred);
      setDefaultTranslationLanguage(defaultLang);
      setTranslationTargetLanguage(defaultLang);
      const filteredOpts = Array.isArray(data.translationModelOptions)
        ? data.translationModelOptions.filter(
            (o): o is TranslationModelOptionRow =>
              Boolean(
                o &&
                  typeof o === "object" &&
                  typeof o.value === "string" &&
                  typeof o.model === "string" &&
                  typeof o.provider === "string",
              ),
          )
        : [];
      if (filteredOpts.length > 0) {
        setTranslationModelOptions(filteredOpts);
        const v =
          typeof data.translationModel === "string" ? data.translationModel.trim() : "";
        if (v && filteredOpts.some((o) => o.value === v)) {
          setTranslationPreferenceModel(v);
        } else {
          setTranslationPreferenceModel(filteredOpts[0]!.value);
        }
      }
      setPrefsMessage(t("settings.prefsSaved"));
    } catch (e) {
      setPrefsMessage(e instanceof Error ? e.message : t("settings.saveFailed"));
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRunTranslation = async () => {
    if (!authorId || !translationNovelId || translationRunning || translationBatchRunning)
      return;
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
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId: authorId,
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

  const handleTranslateAllChapters = async () => {
    if (
      !authorId ||
      !translationNovelId ||
      translationBatchRunning ||
      translationRunning
    )
      return;
    if (translationSourceMode !== "chapter") {
      setTranslationError("请切换到「发布章节」来源后再使用全书翻译");
      return;
    }
    if (translationChapters.length === 0) {
      setTranslationError("暂无章节列表，请等待章节加载完成");
      return;
    }

    const target = translationTargetLanguage;
    const list = translationChapters.filter((c) => {
      if (!translationSkipExistingTargetLang) return true;
      return !c.translatedLangs.includes(target);
    });
    if (list.length === 0) {
      setTranslationError(
        "没有需要翻译的章节（所选语种均已存在译文，或去掉「跳过已有译文」后重试）",
      );
      return;
    }

    setTranslationError(null);
    setTranslationBatchRunning(true);
    setTranslationBatchDetail("");
    setTranslationProgress(0);
    const ac = new AbortController();
    translationBatchAbortRef.current = ac;
    const skippedCount = translationChapters.length - list.length;

    try {
      for (let i = 0; i < list.length; i += 1) {
        if (ac.signal.aborted) {
          setTranslationError("已取消全书翻译");
          break;
        }
        const ch = list[i]!;
        setTranslationBatchDetail(
          `第 ${i + 1} / ${list.length} 章：${ch.title.length > 72 ? `${ch.title.slice(0, 72)}…` : ch.title}`,
        );
        setTranslationProgress(Math.round((i / Math.max(list.length, 1)) * 100));
        setTranslationChapterId(ch.id);

        const res = await fetch("/api/v1/novel-translation/translate", {
          method: "POST",
          signal: ac.signal,
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({
            authorId,
            novelId: translationNovelId,
            sourceType: "chapter",
            chapterId: ch.id,
            targetLanguage: target,
          }),
        });
        const data = await readApiJsonSafe<{
          sourceText?: string;
          translatedText?: string;
          model?: string;
          error?: string;
        }>(res);
        if (!res.ok) {
          throw new Error(
            `「${ch.title}」翻译失败：${data.error ?? `HTTP ${res.status}`}`,
          );
        }
        setTranslationSourcePreview((data.sourceText ?? "").slice(0, 120));
        setTranslationSourceFullText(data.sourceText ?? "");
        setTranslationOutputText(data.translatedText ?? "");
        if (data.model) setTranslationEngineModel(data.model);
        setTranslationProgress(Math.round(((i + 1) / list.length) * 100));
      }

      if (!ac.signal.aborted) {
        setTranslationBatchDetail(
          skippedCount > 0
            ? `全书翻译完成：已处理 ${list.length} 章，跳过 ${skippedCount} 章（已有 ${translationLangLabel(target, locale)} 译文）`
            : `全书翻译完成：已处理 ${list.length} 章`,
        );
        setTranslationProgress(100);
        await loadTranslationSources(translationNovelId);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setTranslationError("已取消全书翻译");
      } else {
        setTranslationError(e instanceof Error ? e.message : "全书翻译失败");
      }
    } finally {
      translationBatchAbortRef.current = null;
      setTranslationBatchRunning(false);
      if (ac.signal.aborted) {
        setTranslationProgress(0);
        setTranslationBatchDetail("");
      }
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
    if (!authorId) return [];
    if (ticketImages.length === 0) return [];
    const form = new FormData();
    for (const f of ticketImages) form.append("files", f);
    const res = await fetch("/api/v1/image-host", {
      method: "POST",
      headers: {
        "x-wallet-address": authorId,
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
  }, [authorId, ticketImages]);

  const handleCreateTicket = async () => {
    if (!authorId || ticketSubmitting) return;
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
          "x-wallet-address": authorId,
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
      if (!authorId || !list || list.length === 0 || audioUploading) return;
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
          form.append("authorId", authorId);
          form.append("novelId", audiobookNovelId);
          for (const f of files) {
            form.append("files", f);
          }
          const data = await new Promise<{ items?: UploadedAudioItem[]; error?: string }>(
            (resolve, reject) => {
              const xhr = new XMLHttpRequest();
              audioUploadXhrRef.current = xhr;
              xhr.open("POST", url);
              xhr.setRequestHeader("x-wallet-address", authorId);
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
    [authorId, audioUploading, audiobookNovelId, loadAudiobooks],
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
    if (!authorId || !ticketIsAdmin) return;
    setTicketsError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
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
    // Keep URL text clearly below QR frame; the QR white frame bottoms at y=1100.
    drawWrappedCenteredTextClamped(ctx, targetUrl, 540, 1160, 860, 38, 3);

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

  if (!sessionResolved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[var(--background)] px-4 text-neutral-800 dark:text-neutral-100">
        <p className="text-sm font-medium">{t("workspace.sessionLoading")}</p>
      </div>
    );
  }

  const walletBusy =
    status === "reconnecting" ||
    status === "connecting" ||
    isConnectPending;

  if (walletBusy && !authorId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[var(--background)] px-4 text-neutral-800 dark:text-neutral-100">
        <p className="text-sm font-medium">{t("workspace.connectingTitle")}</p>
        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          {t("workspace.connectingHint")}
        </p>
      </div>
    );
  }

  if (!authorId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4 py-10 text-neutral-800 dark:text-neutral-100">
        <WorkspaceAuthGate />
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
            {t("workspace.tabNovels")}
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
            {t("workspace.tabPublish")}
          </button>
          <button
            type="button"
            onClick={() => setTab("video")}
            className={
              tab === "video"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            {t("workspace.tabVideo")}
          </button>
          <button
            type="button"
            onClick={() => setTab("pdfSign")}
            className={
              tab === "pdfSign"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            {t("workspace.tabPdfSign")}
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
            {t("workspace.tabSettings")}
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
            {t("workspace.tabTranslation")}
          </button>
          <button
            type="button"
            onClick={() => setTab("aiChat")}
            className={
              tab === "aiChat"
                ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }
          >
            {t("workspace.tabAiChat")}
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
            {t("workspace.tabAnalytics")}
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
            {t("workspace.tabTickets")}
          </button>
          {vipAdmin === true ? (
            <button
              type="button"
              onClick={() => setTab("adminMembers")}
              className={
                tab === "adminMembers"
                  ? "rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium dark:bg-neutral-800"
                  : "rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
              }
            >
              {t("workspace.tabAdminMembers")}
            </button>
          ) : null}
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
                                约 {entry.novel.wordCount.toLocaleString("zh-CN")} 字
                                <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">
                                  ·
                                </span>
                                最后修改 {formatModified(entry.novel.lastModified, locale)}
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
                            上传时间：{formatModified(entry.audiobook.updatedAt, locale)}
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
              查看每部作品的读者可见状态。详细配置与撤回请在对应作品的编辑器大纲区操作。下方「阅读
              UV」按上海时区的自然日、对访问 IP 做哈希后去重：同一 IP 同一天对同一作品最多计 1；跨日再访问会再计。
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
                      ? formatModified(row.record.publishedAt, locale)
                      : "—";
                    const aidNorm = (row.record?.articleId ?? "").trim().toLowerCase();
                    const uv =
                      /^art_[0-9a-f]{10}$/.test(aidNorm) ? articleUvByArticleId[aidNorm] : undefined;
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
                          {uv ? (
                            <p className="mt-0.5 text-[10px] text-zinc-600">
                              阅读 UV：今日 {uv.today} · 近 7 日去重 {uv.uv7} · 近 30 日去重{" "}
                              {uv.uv30}
                            </p>
                          ) : null}
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

        {tab === "video" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">视频管理</h2>
            <p className="max-w-xl text-sm text-neutral-600 dark:text-neutral-400">
              上传 MP4（从视频提取音轨）、MP3（直接入库）、WAV / Opus / Ogg（服务端转码为 MP3
              后入库，与读者「朗读」链一致）。若服务端配置了 S3 兼容桶（如 Cloudflare R2），将优先使用浏览器直传对象存储；否则在需转码且文件大于 4MB
              时会自动分片上传，减轻反代对单次请求体大小的限制。每条记录可在「语音转文字」Tab
              将 MP3 转为文稿（ElevenLabs）。在下方选择小说与章节后，于「MP3」Tab
              点击「关联到章节」，读者即可在该章「朗读」页播放此音频。
            </p>
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
              <input
                ref={videoMp4InputRef}
                type="file"
                accept={VIDEO_UPLOAD_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  void handleVideoMp4Selected(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={videoExtractUploading}
                  onClick={() => videoMp4InputRef.current?.click()}
                  className="rounded-lg border border-violet-500/60 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-500/20 disabled:opacity-50 dark:text-violet-200 dark:hover:bg-violet-500/15"
                >
                  {videoExtractUploading ? "上传中…" : "选择 MP4 / MP3 / WAV / Opus 上传"}
                </button>
                <span className="text-xs text-neutral-500">
                  单文件约 ≤220MB；提取结果保存在你的账号下。
                </span>
              </div>
              {videoExtractUploadError ? (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  {videoExtractUploadError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <h3 className="text-sm font-semibold text-zinc-100">关联目标</h3>
                <p className="mt-1 text-[11px] text-zinc-500">
                  需已存在发布配置的小说；章节列表与翻译模块同源。
                </p>
                <label className="mt-3 block text-xs font-medium text-zinc-300">
                  小说
                </label>
                <select
                  value={videoAssocNovelId}
                  onChange={(e) => {
                    setVideoAssocNovelId(e.target.value);
                    setVideoAssocMessage(null);
                  }}
                  disabled={loadingPublish || publishRows.length === 0}
                  className="mt-1 w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="">
                    {loadingPublish ? "加载中…" : "请选择小说"}
                  </option>
                  {publishRows.map((row) => (
                    <option key={row.novelId} value={row.novelId}>
                      {row.novelTitle}
                    </option>
                  ))}
                </select>
                <label className="mt-3 block text-xs font-medium text-zinc-300">
                  章节
                </label>
                <select
                  value={videoAssocChapterId}
                  onChange={(e) => {
                    setVideoAssocChapterId(e.target.value);
                    setVideoAssocMessage(null);
                  }}
                  disabled={!videoAssocNovelId || videoAssocChaptersLoading}
                  className="mt-1 w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="">
                    {videoAssocChaptersLoading ? "加载章节…" : "请选择章节"}
                  </option>
                  {videoAssocChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                {videoAssocMessage ? (
                  <p className="mt-3 text-xs text-emerald-400">{videoAssocMessage}</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <h3 className="text-sm font-semibold text-zinc-100">已提取的 MP3</h3>
                {videoExtractLoading ? (
                  <p className="mt-2 text-sm text-zinc-500">加载中…</p>
                ) : videoExtractError ? (
                  <p className="mt-2 text-sm text-rose-400">{videoExtractError}</p>
                ) : videoExtractItems.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    暂无记录，请先上传 MP4、MP3、WAV 或 Opus / Ogg。
                  </p>
                ) : (
                  <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                    {videoExtractItems.map((item) => {
                      const panel = videoCardPanelById[item.id] ?? "audio";
                      const transcript = videoTranscriptById[item.id] ?? "";
                      const sttErr = videoTranscribeErrorById[item.id];
                      const sttBusy = videoTranscribingId === item.id;
                      const delBusy = videoExtractDeletingId === item.id;
                      const isProcessing = item.status === "processing";
                      const isFailed = item.status === "failed";
                      const canUseMp3 =
                        !isProcessing && !isFailed && Boolean(item.mp3Url?.trim());
                      return (
                        <li
                          key={item.id}
                          className="rounded-lg border border-[#2a3f5c] bg-[#0d1625] p-2.5"
                        >
                          <p
                            className="truncate text-xs font-medium text-zinc-200"
                            title={item.sourceName}
                          >
                            {item.sourceName}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {(() => {
                              const src = item.sourceSize;
                              const mp3 = item.size;
                              const showDual =
                                typeof src === "number" &&
                                Math.abs(src - mp3) > 512;
                              const mb = (n: number) => (n / (1024 * 1024)).toFixed(2);
                              return showDual
                                ? `源 ${mb(src)} MB · MP3 ${mb(mp3)} MB`
                                : `${mb(mp3)} MB`;
                            })()}
                            {" · "}
                            {formatModified(item.createdAt, locale)}
                            {isProcessing ? (
                              <span className="ml-1 font-medium text-amber-400">· 转码中</span>
                            ) : null}
                            {isFailed ? (
                              <span className="ml-1 font-medium text-rose-400">· 转码失败</span>
                            ) : null}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setVideoCardPanelById((prev) => ({ ...prev, [item.id]: "audio" }))
                              }
                              className={
                                panel === "audio"
                                  ? "rounded-md border border-violet-400/60 bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-200"
                                  : "rounded-md border border-[#324866] bg-[#0d1625] px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200"
                              }
                            >
                              MP3
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setVideoCardPanelById((prev) => ({
                                  ...prev,
                                  [item.id]: "transcript",
                                }))
                              }
                              className={
                                panel === "transcript"
                                  ? "rounded-md border border-violet-400/60 bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-200"
                                  : "rounded-md border border-[#324866] bg-[#0d1625] px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200"
                              }
                            >
                              语音转文字
                            </button>
                          </div>
                          {panel === "audio" ? (
                            <>
                              {isProcessing ? (
                                <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
                                  文件已上传并落盘，正在后台转码为 MP3。完成后将弹窗提示；您也可稍后切回本页查看列表状态。
                                </p>
                              ) : isFailed ? (
                                <p className="mt-2 text-[11px] leading-relaxed text-rose-400">
                                  {item.processError?.trim()
                                    ? item.processError.trim()
                                    : "转码失败，请删除后重新上传。"}
                                </p>
                              ) : (
                                <>
                                  <audio
                                    controls
                                    src={item.mp3Url}
                                    className="mt-2 w-full"
                                    preload="metadata"
                                  />
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <a
                                      href={item.mp3Url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-cyan-400 underline"
                                    >
                                      打开链接
                                    </a>
                                    <button
                                      type="button"
                                      disabled={
                                        !canUseMp3 ||
                                        videoAssocLinkingId === item.id ||
                                        !videoAssocNovelId ||
                                        !videoAssocChapterId
                                      }
                                      onClick={() =>
                                        void linkExtractToChapter(item.mp3Url, item.id)
                                      }
                                      className="rounded border border-emerald-500/50 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                                    >
                                      {videoAssocLinkingId === item.id ? "关联中…" : "关联到章节"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        delBusy ||
                                        videoAssocLinkingId === item.id ||
                                        sttBusy
                                      }
                                      onClick={() => void deleteVideoExtract(item.id)}
                                      className="rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200 hover:bg-rose-500/15 disabled:opacity-40"
                                    >
                                      {delBusy ? "删除中…" : "删除 MP3"}
                                    </button>
                                  </div>
                                </>
                              )}
                              {(isProcessing || isFailed) && (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    disabled={delBusy || videoAssocLinkingId === item.id || sttBusy}
                                    onClick={() => void deleteVideoExtract(item.id)}
                                    className="rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200 hover:bg-rose-500/15 disabled:opacity-40"
                                  >
                                    {delBusy ? "删除中…" : "删除记录"}
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="mt-2 space-y-2">
                              <p className="text-[11px] leading-relaxed text-zinc-500">
                                使用 ElevenLabs Speech-to-Text（scribe_v2）识别当前 MP3。需在服务器环境变量中配置{" "}
                                <span className="font-mono text-zinc-400">ELEVENLABS_API_KEY</span>
                                。
                              </p>
                              {!canUseMp3 ? (
                                <p className="text-[11px] text-amber-200/90">
                                  {isProcessing
                                    ? "该条尚在后台转码，完成后即可开始识别。"
                                    : isFailed
                                      ? "该条转码失败，无法识别；请删除后重新上传。"
                                      : "暂无可用的 MP3 链接。"}
                                </p>
                              ) : null}
                              {sttErr ? (
                                <p className="text-[11px] text-rose-400">{sttErr}</p>
                              ) : null}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={sttBusy || !canUseMp3}
                                  onClick={() => void transcribeVideoExtract(item.id)}
                                  className="rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
                                >
                                  {sttBusy ? "识别中…" : transcript ? "重新识别" : "开始识别"}
                                </button>
                                {transcript ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(transcript);
                                      } catch {
                                        window.alert("复制失败，请手动选择文本复制");
                                      }
                                    }}
                                    className="rounded-lg border border-[#324866] px-3 py-1 text-[11px] text-zinc-300 hover:bg-[#1a2a40]"
                                  >
                                    复制全文
                                  </button>
                                ) : null}
                              </div>
                              <textarea
                                readOnly
                                value={transcript}
                                placeholder={sttBusy ? "正在识别…" : "识别结果将显示在这里"}
                                rows={8}
                                className="w-full resize-y rounded-md border border-[#324866] bg-[#0a1018] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-200 placeholder:text-zinc-600"
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "pdfSign" && <PdfSignatureTool />}

        {tab === "translation" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">多语言翻译</h2>
            <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              关联发布管理数据，可直接对发布章节或草稿进行翻译。支持手动触发、多语言目标选择、翻译后在线预览与编辑，以及下方「已译稿一览」按章节切换语种查看已落盘译文。
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
                          {chapter.translatedLangs.length > 0
                            ? ` · 译 ${chapter.translatedLangs.map((l) => l.toUpperCase()).join(" ")}`
                            : ""}
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
                            {chapter.translatedLangs.length > 0 ? (
                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                {chapter.translatedLangs.map((lang) => (
                                  <span key={lang} className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      title={`预览 ${lang.toUpperCase()} 译文`}
                                      onClick={() => {
                                        setTranslationChapterId(chapter.id);
                                        setTranslationPreviewChapterId(chapter.id);
                                        setTranslationPreviewLang(lang);
                                      }}
                                      className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-300 hover:bg-emerald-500/20"
                                    >
                                      {lang}
                                    </button>
                                    {translationCompareArticleId ? (
                                      <a
                                        href={`/library/${encodeURIComponent(translationCompareArticleId)}?lang=${encodeURIComponent(lang)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded border border-cyan-500/40 px-1 py-0.5 text-[9px] text-cyan-300 hover:bg-cyan-500/10"
                                        title="读者书库该语种"
                                      >
                                        读
                                      </a>
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {translationCompareArticleId ? (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        对照阅读：打开
                        <a
                          href={`/library/${encodeURIComponent(translationCompareArticleId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mx-1 text-cyan-400 underline"
                        >
                          原文页
                        </a>
                        ，再点上表各语种的「读」打开对应翻译页。
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
                        {translationLangLabel(lang.code, locale)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {t("settings.defaultTargetHint")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleRunTranslation()}
                  disabled={
                    translationRunning || translationBatchRunning || !translationNovelId
                  }
                  className="w-full rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {translationRunning ? "翻译中…" : "手动触发翻译"}
                </button>

                {translationSourceMode === "chapter" && translationChapters.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-indigo-500/30 bg-[#0d1625]/80 p-3">
                    <p className="text-[11px] font-medium text-indigo-200/90">全书顺序翻译</p>
                    <p className="text-[11px] text-zinc-500">
                      按章节列表自上而下逐章调用翻译接口（与「手动触发翻译」相同引擎与账户偏好）；可随时取消；耗时取决于章节数与正文长度。
                    </p>
                    <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-400">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={translationSkipExistingTargetLang}
                        onChange={(e) => setTranslationSkipExistingTargetLang(e.target.checked)}
                        disabled={translationBatchRunning || translationRunning}
                      />
                      <span>
                        跳过已有「
                        {translationLangLabel(translationTargetLanguage, locale)}
                        」译文的章节（避免重复消耗）
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTranslateAllChapters()}
                        disabled={
                          translationBatchRunning ||
                          translationRunning ||
                          !translationNovelId ||
                          translationLoadingSources
                        }
                        className="rounded-lg border border-indigo-400/60 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {translationBatchRunning
                          ? "全书翻译进行中…"
                          : `开始全书翻译（${translationSkipExistingTargetLang ? translationChapters.filter((c) => !c.translatedLangs.includes(translationTargetLanguage)).length : translationChapters.length} 章）`}
                      </button>
                      {translationBatchRunning ? (
                        <button
                          type="button"
                          onClick={() => translationBatchAbortRef.current?.abort()}
                          className="rounded-lg border border-rose-400/50 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20"
                        >
                          取消全书翻译
                        </button>
                      ) : null}
                    </div>
                    {translationBatchDetail ? (
                      <p className="text-[11px] leading-relaxed text-zinc-400">
                        {translationBatchDetail}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {(translationRunning || translationBatchRunning || translationProgress > 0) && (
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

            <div className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
              <h3 className="text-sm font-semibold text-zinc-100">已译稿一览 / 按章节预览</h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                展示翻译存储中已有落盘译文的章节与语种；选择章节与语种后加载正文预览（与上方「手动触发翻译」独立）。
              </p>
              {!translationNovelId ? (
                <p className="mt-3 text-xs text-zinc-500">请先选择小说。</p>
              ) : novelTranslatedLanguages.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">
                  当前小说暂无已保存的多语译文；完成翻译并写入存储后会出现在此。
                </p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="text-[11px] text-zinc-500">全书语种：</span>
                    {novelTranslatedLanguages.map((code) => (
                      <span
                        key={code}
                        className="rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-indigo-200"
                      >
                        {translationLangLabel(code, locale)}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 overflow-x-auto rounded-lg border border-[#324866]">
                    <table className="w-full min-w-[320px] text-left text-[11px] text-zinc-300">
                      <thead className="border-b border-[#324866] bg-[#0d1625] text-zinc-500">
                        <tr>
                          <th className="px-2 py-2 font-medium">章节</th>
                          <th className="px-2 py-2 font-medium">已有译文</th>
                        </tr>
                      </thead>
                      <tbody>
                        {translationChapters.map((chapter) => (
                          <tr
                            key={chapter.id}
                            className="border-b border-[#243652] last:border-0 hover:bg-[#0d1625]/80"
                          >
                            <td className="max-w-[200px] truncate px-2 py-1.5" title={chapter.title}>
                              {chapter.title}
                            </td>
                            <td className="px-2 py-1.5">
                              {chapter.translatedLangs.length === 0 ? (
                                <span className="text-zinc-600">—</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {chapter.translatedLangs.map((lang) => (
                                    <button
                                      key={lang}
                                      type="button"
                                      onClick={() => {
                                        setTranslationPreviewChapterId(chapter.id);
                                        setTranslationPreviewLang(lang);
                                      }}
                                      className={
                                        chapter.id === translationPreviewChapterId &&
                                        lang === translationPreviewLang
                                          ? "rounded border border-amber-400/70 bg-amber-500/20 px-1.5 py-0.5 font-medium uppercase text-amber-100"
                                          : "rounded border border-zinc-600 bg-[#0d1625] px-1.5 py-0.5 font-medium uppercase text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-200"
                                      }
                                    >
                                      {lang}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-400">
                        预览章节
                      </label>
                      <select
                        value={translationPreviewChapterId}
                        onChange={(e) => setTranslationPreviewChapterId(e.target.value)}
                        disabled={translationLoadingSources}
                        className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                      >
                        {translationChapters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-400">
                        预览语种
                      </label>
                      <select
                        value={translationPreviewLang}
                        onChange={(e) => setTranslationPreviewLang(e.target.value)}
                        disabled={
                          translationLoadingSources ||
                          !(translationChapters.find(
                            (c) => c.id === translationPreviewChapterId,
                          )?.translatedLangs.length ?? 0)
                        }
                        className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                      >
                        {(
                          translationChapters.find(
                            (c) => c.id === translationPreviewChapterId,
                          )?.translatedLangs ?? []
                        ).length === 0 ? (
                          <option value="">（该章无已存译文）</option>
                        ) : null}
                        {(
                          translationChapters.find(
                            (c) => c.id === translationPreviewChapterId,
                          )?.translatedLangs ?? []
                        ).map((code) => (
                          <option key={code} value={code}>
                            {translationLangLabel(code, locale)} ({code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {translationPreviewError ? (
                    <p className="mt-2 text-xs text-rose-400">{translationPreviewError}</p>
                  ) : null}
                  {translationPreviewLoading ? (
                    <p className="mt-2 text-xs text-zinc-500">正在加载译文…</p>
                  ) : null}
                  <label className="mt-3 block text-xs font-medium text-zinc-400">
                    译文正文（只读）
                  </label>
                  <textarea
                    readOnly
                    value={translationPreviewText}
                    rows={12}
                    className="mt-1 w-full resize-y rounded-lg border border-[#324866] bg-[#0b1420] px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200"
                    placeholder="选择章节与语种后自动加载"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                    {translationPreviewUpdatedAt ? (
                      <span>
                        存储更新时间：
                        {formatModified(translationPreviewUpdatedAt, locale)}
                      </span>
                    ) : null}
                    {translationCompareArticleId && translationPreviewLang ? (
                      <a
                        href={`/library/${encodeURIComponent(translationCompareArticleId)}?lang=${encodeURIComponent(translationPreviewLang)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 underline hover:text-cyan-300"
                      >
                        在书库打开当前语种
                      </a>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "aiChat" && authorId && (
          <div className="w-full min-w-0 max-w-5xl space-y-4">
            <WorkspaceClaudeChat authorId={authorId} />
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">活跃用户统计</h2>
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
              统计口径：按作者身份去重，合计 MetaMask 钱包与邮箱密码登录；邮箱账户在服务端对应唯一合成
              0x 作者 ID，与真实钱包地址使用同一套埋点去重。DAU=今日，WAU=近 7 天，MAU=近 30 天。
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
                    近 {analyticsData.range} 活跃用户趋势
                  </p>
                  <div className="flex h-44 items-end gap-1 overflow-x-auto rounded-lg border border-[#2a3b57] bg-[#0f1726] p-3">
                    {(() => {
                      const max = Math.max(
                        ...analyticsData.series.map((x) => x.activeUsers),
                        1,
                      );
                      return analyticsData.series.map((point) => {
                        const h = Math.max(
                          6,
                          Math.round((point.activeUsers / max) * 120),
                        );
                        return (
                          <div
                            key={point.date}
                            className="flex min-w-[18px] flex-col items-center justify-end gap-1"
                            title={`${point.date}: ${point.activeUsers}`}
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
                            用户 {row.users.toLocaleString("zh-CN")} · 事件{" "}
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
                          {ticket.createdBy} · {formatModified(ticket.createdAt, locale)}
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

        {tab === "adminMembers" && vipAdmin === true && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("workspace.tabAdminMembers")}</h2>
            <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              仅当连接钱包为{" "}
              <code className="rounded bg-neutral-200 px-1 text-xs dark:bg-neutral-800">ADMIN_ADDRESS</code>{" "}
              时可见。会员数据写入{" "}
              <code className="rounded bg-neutral-200 px-1 text-xs dark:bg-neutral-800">.data/billing/members/</code>
              （按作者 ID，即 0x 地址文件名）。邮箱注册用户也会分配同一格式的作者 ID；可直接填写注册邮箱，系统会解析为对应 ID。续期从当前周期结束时间顺延；撤销将删除该会员文件。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <h3 className="text-sm font-semibold text-zinc-100">授予 / 续期 VIP</h3>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">
                    作者 ID（0x…）或注册邮箱
                  </label>
                  <input
                    type="text"
                    value={vipGrantWallet}
                    onChange={(e) => setVipGrantWallet(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 font-mono text-sm text-zinc-100"
                    placeholder="0x… 或 user@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">延长天数</label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={vipGrantDays}
                    onChange={(e) => setVipGrantDays(Number(e.target.value) || 30)}
                    className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleVipGrant()}
                  disabled={vipSubmitting || !vipGrantWallet.trim()}
                  className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {vipSubmitting ? "处理中…" : "确认授予 / 续期"}
                </button>
              </section>
              <section className="space-y-3 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">会员列表</h3>
                  <button
                    type="button"
                    onClick={() => void loadVipMembers()}
                    disabled={vipLoading}
                    className="rounded border border-[#324866] px-2.5 py-1 text-xs text-zinc-300 hover:bg-[#0d1625] disabled:opacity-50"
                  >
                    刷新
                  </button>
                </div>
                {vipError ? (
                  <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {vipError}
                  </p>
                ) : null}
                {vipLoading ? (
                  <p className="text-xs text-zinc-500">加载中…</p>
                ) : vipMembers.length === 0 ? (
                  <p className="text-xs text-zinc-500">暂无会员记录</p>
                ) : (
                  <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {vipMembers.map((row) => (
                      <li
                        key={row.address}
                        className="rounded-lg border border-[#2a3b57] bg-[#0f1726] p-3"
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-all font-mono text-xs text-zinc-200">{row.address}</p>
                            {row.email ? (
                              <p className="mt-0.5 break-all text-[11px] text-sky-400/90">
                                邮箱：{row.email}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={
                              row.active
                                ? "shrink-0 rounded-full border border-emerald-400/50 px-2 py-0.5 text-[11px] text-emerald-300"
                                : "shrink-0 rounded-full border border-zinc-500/50 px-2 py-0.5 text-[11px] text-zinc-400"
                            }
                          >
                            {row.active ? "当前有效" : "未生效 / 已过期"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          状态 {row.record.status} · 周期至{" "}
                          {formatModified(row.record.currentPeriodEnd, locale)}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleVipRevoke(row.address)}
                          disabled={vipSubmitting}
                          className="mt-2 rounded border border-rose-500/40 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          撤销 VIP
                        </button>
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
            <h2 className="text-lg font-semibold">{t("settings.title")}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t("settings.blurb")}
            </p>
            <section className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
              <SiteLocaleControl id="workspace-settings-ui-locale" />
            </section>
            <WalletConnect />

            <section className="space-y-3 rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4">
              <h3 className="text-sm font-semibold text-zinc-100">
                {t("settings.translationPrefsTitle")}
              </h3>
              <p className="text-xs text-zinc-400">
                {t("settings.translationPrefsBlurb")}
              </p>
              {translationModelOptions.length > 0 ? (
                <div>
                  <label
                    htmlFor="workspace-translation-model"
                    className="mb-1 block text-xs font-medium text-zinc-300"
                  >
                    {t("settings.translationModel")}
                  </label>
                  <p className="mb-2 text-[11px] text-zinc-500">
                    {t("settings.translationModelHint")}
                  </p>
                  <select
                    id="workspace-translation-model"
                    value={translationPreferenceModel}
                    onChange={(e) => setTranslationPreferenceModel(e.target.value)}
                    disabled={prefsLoading || savingPrefs}
                    className="w-full max-w-md rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                  >
                    {translationModelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {translationModelOptionLabel(opt, t)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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
                    {translationLangLabel(lang.code, locale)}
                  </label>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  {t("settings.defaultTargetLang")}
                </label>
                <p className="mb-2 text-[11px] text-zinc-500">
                  {t("settings.defaultTargetHint")}
                </p>
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
                      {translationLangLabel(code, locale)}
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
                {savingPrefs ? t("settings.savingPrefs") : t("settings.saveTranslationPrefs")}
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
