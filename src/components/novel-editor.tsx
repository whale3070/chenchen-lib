"use client";

import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";

import { FileDown, FileUp, Rocket } from "lucide-react";
import Link from "next/link";

import { OutlineSidebar } from "@/components/outline-sidebar";
import { PublishNovelModal } from "@/components/publish-novel-modal";
import { PersonaDetailCard } from "@/components/persona-detail";
import { PersonaSidebar } from "@/components/persona-sidebar";
import { SimulationPanel } from "@/components/simulation-panel";
import { WalletConnect } from "@/components/wallet-connect";
import { SelectionLock } from "@/extensions/selection-lock";
import { SimulationShortcut } from "@/extensions/simulation-shortcut";
import type { EditorDeduceContext } from "@/lib/editor-context";
import {
  derivePublishDisplayStatus,
  getPrimaryVolumeForPublish,
  publishStatusLabelZh,
  type PublishLayoutMode,
  type NovelPublishRecord,
} from "@/lib/novel-publish";
import { plainTextToTipTapHtml } from "@/lib/manuscript-txt";
import { createEmptyPersona } from "@/lib/persona-factory";
import {
  applySelectionToEditor,
  applyViewportScroll,
  computeWritingSnippet,
  formatAuthorLabel,
  hasWritingPayload,
  pickNewerWritingContext,
  readWritingContextFromStorage,
  shouldShowWakeupBar,
  writeWritingContextToStorage,
  type WritingContextPayload,
} from "@/lib/writing-context";
import { useAuthStore } from "@/store/auth-store";
import type { Persona, PlotNode } from "@chenchen/shared/types";

export type NovelEditorWorkspaceProps = {
  /** 与 save-draft / 大纲 / 角色存档绑定的作品 ID */
  novelId: string;
};

function decodeTxtAuto(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  // BOM 优先：UTF-8 / UTF-16LE / UTF-16BE
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // 浏览器通常不直接提供 utf-16be，手动调换字节后按 utf-16le 解码
    const be = bytes.subarray(2);
    const swapped = new Uint8Array(be.length - (be.length % 2));
    for (let i = 0; i + 1 < be.length; i += 2) {
      swapped[i] = be[i + 1];
      swapped[i + 1] = be[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }

  // 先严格按 UTF-8 解；失败后回退到 GB18030（覆盖 GBK/GB2312）
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

function createDefaultChapterOneNodes(): PlotNode[] {
  return [
    {
      id: `ch-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`,
      kind: "chapter",
      title: "第一章",
      summary: "",
    },
  ];
}

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

const MARKDOWN_EDITOR_POPUP_MESSAGE_TYPE = "chenchen:markdown-editor-publish";

function parseChapterNoFromTitle(title: string): number | null {
  const t = title.trim();
  const m = t.match(/^第([一二三四五六七八九十]|\d+)章/);
  if (!m) return null;
  const token = m[1];
  if (/^\d+$/.test(token)) return Number.parseInt(token, 10);
  return CHAPTER_CN_TO_NUM[token] ?? null;
}

function chapterNoLabel(n: number): string {
  const map = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (n >= 1 && n <= 10) return map[n];
  return String(n);
}

function buildChapterTitle(n: number): string {
  return `第${chapterNoLabel(n)}章`;
}

function makePlotNodeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function chapterHtmlFromNode(node: PlotNode | undefined): string | null {
  if (!node?.metadata || typeof node.metadata !== "object") return null;
  const raw = (node.metadata as Record<string, unknown>).chapterHtml;
  if (typeof raw !== "string") return null;
  const html = raw.trim();
  return html.length > 0 ? html : null;
}

function htmlToMarkdownSeed(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeInlineScriptPayload(value: string): string {
  return value
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildMarkdownEditorWindowHtml(initialMarkdown: string): string {
  const escaped = escapeInlineScriptPayload(JSON.stringify(initialMarkdown));
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown 编辑器（支持表格）</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0a0e17;
        color: #e5e7eb;
      }
      .shell {
        display: flex;
        min-height: 100vh;
        flex-direction: column;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #1e2a3f;
        padding: 12px 16px;
      }
      .title {
        color: #4fc3f7;
        font-size: 14px;
        font-weight: 600;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      button {
        border: 1px solid #3f3f46;
        background: transparent;
        color: #d4d4d8;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
      }
      button:hover {
        border-color: #4fc3f7;
        color: #67e8f9;
      }
      .apply {
        border-color: rgba(16, 185, 129, 0.45);
        color: #86efac;
      }
      .apply:hover {
        background: rgba(16, 185, 129, 0.1);
      }
      .content {
        display: grid;
        min-height: 0;
        flex: 1;
        grid-template-columns: 1fr 1fr;
      }
      .pane {
        min-height: 0;
        padding: 12px;
      }
      .pane + .pane {
        border-left: 1px solid #1e2a3f;
      }
      .label {
        margin-bottom: 8px;
        font-size: 11px;
        color: #94a3b8;
      }
      textarea {
        height: calc(100vh - 96px);
        width: 100%;
        resize: none;
        border-radius: 8px;
        border: 1px solid #26364d;
        background: #0b1320;
        color: #f4f4f5;
        padding: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        line-height: 1.6;
        outline: none;
      }
      textarea:focus {
        border-color: #22d3ee;
      }
      .preview {
        height: calc(100vh - 96px);
        overflow: auto;
        border: 1px solid #26364d;
        border-radius: 8px;
        padding: 12px;
        background: #0b1320;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      th, td {
        border: 1px solid #334155;
        padding: 6px 8px;
      }
      a {
        color: #67e8f9;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="toolbar">
        <div class="title">Markdown 编辑器（支持表格）</div>
        <div class="actions">
          <button id="cancel-btn" type="button">取消</button>
          <button id="apply-btn" class="apply" type="button">发布本章节</button>
        </div>
      </header>
      <main class="content">
        <section class="pane">
          <div class="label">Markdown 输入（支持表格：\`| 列1 | 列2 |\`）</div>
          <textarea id="markdown-input" placeholder="在这里输入 Markdown..."></textarea>
        </section>
        <section class="pane">
          <div class="label">实时预览</div>
          <article id="markdown-preview" class="preview"></article>
        </section>
      </main>
    </div>
    <script>
      const initialMarkdown = ${escaped};
      const input = document.getElementById("markdown-input");
      const preview = document.getElementById("markdown-preview");
      const cancelBtn = document.getElementById("cancel-btn");
      const applyBtn = document.getElementById("apply-btn");
      input.value = initialMarkdown || "";

      const renderPreview = () => {
        const md = input.value || "";
        const parser = window.marked && typeof window.marked.parse === "function"
          ? window.marked.parse
          : (txt) => txt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\n/g, "<br>");
        preview.innerHTML = parser(md, { breaks: true });
      };

      input.addEventListener("input", renderPreview);
      cancelBtn.addEventListener("click", () => window.close());
      applyBtn.addEventListener("click", () => {
        if (window.opener) {
          window.opener.postMessage(
            {
              type: "${MARKDOWN_EDITOR_POPUP_MESSAGE_TYPE}",
              markdown: input.value || "",
              renderedHtml: preview.innerHTML || "",
            },
            window.location.origin,
          );
        }
        window.close();
      });

      renderPreview();
      input.focus();
    </script>
  </body>
</html>`;
}

function upsertChapterHtml(nodes: PlotNode[], chapterId: string, html: string): PlotNode[] {
  return nodes.map((n) => {
    if (n.id !== chapterId) return n;
    const metadata = {
      ...(n.metadata ?? {}),
      // Keep all publish variants in sync to avoid reader seeing stale desktop/mobile HTML.
      chapterHtml: html,
      chapterHtmlDesktop: html,
      chapterHtmlMobile: html,
    };
    return { ...n, metadata };
  });
}

export function NovelEditorWorkspace({ novelId }: NovelEditorWorkspaceProps) {
  const [manageTab, setManageTab] = useState<"personas" | "outline" | "finance">(
    "personas",
  );
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [novelTitleForHeader, setNovelTitleForHeader] = useState<string | null>(
    null,
  );
  const [bookPremise, setBookPremise] = useState("");
  const bookPremiseRef = useRef("");
  useEffect(() => {
    bookPremiseRef.current = bookPremise;
  }, [bookPremise]);

  const [outlineNodes, setOutlineNodes] = useState<PlotNode[]>(() =>
    createDefaultChapterOneNodes(),
  );

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [deduceContext, setDeduceContext] =
    useState<EditorDeduceContext | null>(null);

  /** 发布模块：服务端持久化的发布配置 */
  const [publishRecord, setPublishRecord] = useState<NovelPublishRecord | null>(
    null,
  );
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [paymentQrImage, setPaymentQrImage] = useState<string | null>(null);
  const [paymentQrLoading, setPaymentQrLoading] = useState(false);
  const [paymentQrSaving, setPaymentQrSaving] = useState(false);
  const [chapterPublishSubmitting, setChapterPublishSubmitting] = useState(false);
  const markdownEditorPopupRef = useRef<Window | null>(null);
  const editorInstanceRef = useRef<Editor | null>(null);
  const [chapterEditTab, setChapterEditTab] = useState<"read" | "edit">("edit");

  const personasRef = useRef(personas);
  useEffect(() => {
    personasRef.current = personas;
  }, [personas]);

  const openPanelWithEditorContext = useCallback((editorInstance: Editor) => {
    try {
      if (editorInstance.isDestroyed || !editorInstance.state) {
        setDeduceContext(null);
        setSimOpen(true);
        return;
      }
      const { from, to } = editorInstance.state.selection;
      const doc = editorInstance.state.doc;
      editorInstance.commands.setSelectionLock({ from, to });
      const premise = bookPremiseRef.current.trim();
      setDeduceContext({
        selection: doc.textBetween(from, to, "\n\n", "\n\n"),
        fullDocument: doc.textBetween(0, doc.content.size, "\n\n", "\n\n"),
        selectionFrom: from,
        selectionTo: to,
        personasSnapshot: [...personasRef.current],
        ...(premise ? { bookPremise: premise } : {}),
      });
    } catch {
      setDeduceContext(null);
      if (!editorInstance.isDestroyed) {
        editorInstance.commands.clearSelectionLock();
      }
    }
    setSimOpen(true);
  }, []);

  const openPanelRef = useRef(openPanelWithEditorContext);
  useEffect(() => {
    openPanelRef.current = openPanelWithEditorContext;
  }, [openPanelWithEditorContext]);

  const authorId = useAuthStore((s) => s.authorId);
  const authorIdRef = useRef<string | null>(null);
  useEffect(() => {
    authorIdRef.current = authorId;
  }, [authorId]);

  const novelIdRef = useRef(novelId);
  useEffect(() => {
    novelIdRef.current = novelId;
  }, [novelId]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    draftLoadedKeyRef.current = null;
  }, [novelId]);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const importTxtInputRef = useRef<HTMLInputElement | null>(null);
  const aiImportTxtInputRef = useRef<HTMLInputElement | null>(null);
  const [aiChapterizing, setAiChapterizing] = useState(false);
  const uploadZipInputRef = useRef<HTMLInputElement | null>(null);
  const uploadImageInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [uploadedImageItems, setUploadedImageItems] = useState<
    Array<{ name: string; url: string }>
  >([]);

  useEffect(() => {
    if (!authorId) draftLoadedKeyRef.current = null;
  }, [authorId]);

  useEffect(() => {
    setNovelTitleForHeader(null);
    setBookPremise("");
  }, [novelId]);

  useEffect(() => {
    if (!authorId || !novelId) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/novels/lookup?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          {
            headers: { "x-wallet-address": authorId },
            signal: ac.signal,
          },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          novel?: { title?: string; description?: string };
        };
        if (ac.signal.aborted) return;
        if (data.novel?.title) setNovelTitleForHeader(data.novel.title);
        if (typeof data.novel?.description === "string") {
          setBookPremise(data.novel.description);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  /** 发布模块：加载当前作品的发布配置 */
  useEffect(() => {
    if (!authorId || !novelId) {
      setPublishRecord(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/novel-publish?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          {
            headers: { "x-wallet-address": authorId },
            signal: ac.signal,
          },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          record: NovelPublishRecord | null;
        };
        if (ac.signal.aborted) return;
        setPublishRecord(data.record ?? null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const primaryVolumeForPublish = useMemo(
    () => getPrimaryVolumeForPublish(outlineNodes),
    [outlineNodes],
  );

  const publishModalInitialSynopsis =
    primaryVolumeForPublish?.summary ?? bookPremise ?? "";
  const publishModalInitialTags = primaryVolumeForPublish?.tags ?? [];

  const displayPublishStatus = derivePublishDisplayStatus(publishRecord);
  const publishStatusLabelText = publishStatusLabelZh(displayPublishStatus);
  const publishLayoutMode: PublishLayoutMode = publishRecord?.layoutMode ?? "preserve";
  const publishedChapterIdSet = useMemo(
    () => new Set(publishRecord?.publishedChapterIds ?? []),
    [publishRecord],
  );

  const canWithdrawPublish =
    publishRecord?.visibility === "public" &&
    publishRecord?.paymentMode === "free";

  const handleWithdrawPublish = useCallback(async () => {
    if (!authorId) return;
    if (
      !window.confirm("确定撤回公开？作品将恢复为仅自己可见（草稿）。")
    ) {
      return;
    }
    try {
      const r = await fetch("/api/v1/novel-publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          action: "withdraw",
          authorId,
          novelId,
        }),
      });
      const data = (await r.json()) as {
        record?: NovelPublishRecord;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? "撤回失败");
      setPublishRecord(data.record ?? null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "撤回失败");
    }
  }, [authorId, novelId]);

  const postOutlineStructure = useCallback(async (nodes: PlotNode[]) => {
    const aid = authorIdRef.current;
    if (!aid) return;
    try {
      await fetch("/api/v1/update-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId: aid,
          docId: novelIdRef.current,
          nodes,
        }),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const persistActiveChapterBeforePublish = useCallback(async (): Promise<PlotNode[]> => {
    const ed = editorInstanceRef.current;
    if (!ed || ed.isDestroyed || !activeChapterId) {
      await postOutlineStructure(outlineNodes);
      return outlineNodes;
    }
    const nextNodes = upsertChapterHtml(outlineNodes, activeChapterId, ed.getHTML());
    setOutlineNodes(nextNodes);
    await postOutlineStructure(nextNodes);
    return nextNodes;
  }, [activeChapterId, outlineNodes, postOutlineStructure]);

  const handlePublishConfirm = useCallback(
    async (payload: {
      synopsis: string;
      tags: string[];
      visibility: "private" | "public";
      paymentMode: "free" | "paid";
      currency: "HKD" | "USD" | "CNY";
      priceAmount: string;
      updateCommitment: "none" | number;
      refundRuleAck: boolean;
      layoutMode: PublishLayoutMode;
    }) => {
      if (!authorId) throw new Error("请先连接钱包");
      // Ensure publish uses latest active chapter content persisted on server.
      const latestNodes = await persistActiveChapterBeforePublish();
      const allChapterIds = latestNodes
        .filter((n) => n.kind === "chapter")
        .map((n) => n.id);
      const r = await fetch("/api/v1/novel-publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          allChapterIds,
          ...payload,
        }),
      });
      const data = (await r.json()) as {
        record?: NovelPublishRecord;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? "发布失败");
      setPublishRecord(data.record ?? null);
    },
    [authorId, novelId, persistActiveChapterBeforePublish],
  );

  const handleAutoFillPublishMeta = useCallback(
    async (): Promise<{
      synopsis: string;
      tags: string[];
      generatedBy: "deepseek" | "fallback";
    }> => {
    if (!authorId) throw new Error("请先连接钱包");
    const r = await fetch("/api/v1/novel-publish/auto-meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallet-address": authorId,
      },
      body: JSON.stringify({
        authorId,
        novelId,
      }),
    });
    const data = (await r.json()) as {
      synopsis?: string;
      tags?: string[];
      generatedBy?: "deepseek" | "fallback";
      error?: string;
    };
    if (!r.ok) throw new Error(data.error ?? "自动生成失败");
      const generatedBy: "deepseek" | "fallback" =
        data.generatedBy === "deepseek" ? "deepseek" : "fallback";
      return {
      synopsis: typeof data.synopsis === "string" ? data.synopsis : "",
      tags: Array.isArray(data.tags)
        ? data.tags.filter((x): x is string => typeof x === "string")
        : [],
      generatedBy,
      };
    },
    [authorId, novelId],
  );

  const toggleCurrentChapterPublish = useCallback(
    async (publish: boolean, options?: { layoutMode?: PublishLayoutMode }) => {
      if (!authorId || !activeChapterId) return;
      if (displayPublishStatus === "draft") {
        window.alert("请先点击“发布小说”并设为公开后，再按章节发布。");
        return;
      }
      setChapterPublishSubmitting(true);
      try {
        await persistActiveChapterBeforePublish();
        const r = await fetch("/api/v1/novel-publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({
            action: "toggle_chapter",
            authorId,
            novelId,
            chapterId: activeChapterId,
            publish,
            layoutMode: options?.layoutMode ?? publishLayoutMode,
          }),
        });
        const data = (await r.json()) as {
          record?: NovelPublishRecord;
          error?: string;
        };
        if (!r.ok) throw new Error(data.error ?? "章节发布操作失败");
        setPublishRecord(data.record ?? null);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "章节发布操作失败");
      } finally {
        setChapterPublishSubmitting(false);
      }
    },
    [
      authorId,
      activeChapterId,
      displayPublishStatus,
      novelId,
      persistActiveChapterBeforePublish,
      publishLayoutMode,
    ],
  );

  /** 瞬时写入 localStorage，并防抖后同步服务端（与 onUpdate 2000ms 一致）。 */
  const flushWritingContext = useCallback((editor: Editor) => {
    const aid = authorIdRef.current;
    if (!aid || editor.isDestroyed) return;

    const now = Date.now();
    const selectionJson = editor.state.selection.toJSON() as NonNullable<
      WritingContextPayload["selectionJson"]
    >;
    const { from, to } = editor.state.selection;
    const scrollTop = editorScrollRef.current?.scrollTop ?? 0;
    const writingSnippet = computeWritingSnippet(editor);
    const iso = new Date().toISOString();

    const payload: WritingContextPayload = {
      html: editor.getHTML(),
      json: editor.getJSON(),
      selection: { from, to },
      selectionJson,
      lastActionTimestamp: now,
      viewportScroll: scrollTop,
      writingSnippet,
      updatedAt: iso,
    };

    const docId = novelIdRef.current;
    writeWritingContextToStorage(aid, docId, payload);

    void fetch("/api/v1/save-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authorId: aid,
        docId,
        html: payload.html,
        json: payload.json,
        selection: payload.selection,
        selectionJson: payload.selectionJson,
        lastActionTimestamp: payload.lastActionTimestamp,
        viewportScroll: payload.viewportScroll,
        writingSnippet: payload.writingSnippet,
      }),
    }).catch(() => {
      /* 静默失败，避免打断写作 */
    });
  }, []);

  const applyRestoredContext = useCallback(
    (editor: Editor, payload: WritingContextPayload) => {
      if (editor.isDestroyed) return;
      const hasJson =
        payload.json !== null &&
        typeof payload.json === "object" &&
        Object.keys(payload.json as object).length > 0;
      const hasHtml =
        typeof payload.html === "string" && payload.html.trim().length > 0;
      if (hasJson) {
        editor.commands.setContent(payload.json as object, {
          emitUpdate: false,
        });
      } else if (hasHtml) {
        editor.commands.setContent(payload.html!, { emitUpdate: false });
      }
      applySelectionToEditor(editor, payload);
      applyViewportScroll(editorScrollRef.current, payload.viewportScroll);
    },
    [],
  );

  const persistPersonas = useCallback(async (list: Persona[]) => {
    const aid = authorIdRef.current;
    if (!aid) return;
    try {
      await fetch("/api/v1/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId: aid,
          novelId: novelIdRef.current,
          personas: list,
        }),
      });
    } catch {
      /* 静默失败 */
    }
  }, []);

  const personaEditSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (personaEditSaveTimerRef.current) {
        clearTimeout(personaEditSaveTimerRef.current);
      }
    };
  }, []);

  const handlePersonaDetailChange = useCallback(
    (updated: Persona) => {
      setPersonas((prev) => {
        const next = prev.map((p) => (p.id === updated.id ? updated : p));
        if (personaEditSaveTimerRef.current) {
          clearTimeout(personaEditSaveTimerRef.current);
        }
        personaEditSaveTimerRef.current = setTimeout(() => {
          personaEditSaveTimerRef.current = null;
          void persistPersonas(next);
        }, 500);
        return next;
      });
    },
    [persistPersonas],
  );

  /** 从服务端按钱包加载角色；无存档时保持空列表。 */
  useEffect(() => {
    if (!authorId) {
      setPersonas([]);
      setSelectedId(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/personas?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          { signal: ac.signal },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          personas: Persona[] | null;
          updatedAt: string | null;
        };
        if (ac.signal.aborted) return;
        if (data.personas && data.personas.length > 0) {
          setPersonas(data.personas);
          setSelectedId(data.personas[0].id);
        } else {
          setPersonas([]);
          setSelectedId(null);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const handleAddPersona = useCallback(() => {
    const created = createEmptyPersona();
    setPersonas((prev) => {
      const next = [...prev, created];
      void persistPersonas(next);
      return next;
    });
    setSelectedId(created.id);
  }, [persistPersonas]);

  const handleDeletePersona = useCallback(
    (pid: string) => {
      if (!authorId) return;
      setPersonas((prev) => {
        const next = prev.filter((p) => p.id !== pid);
        void persistPersonas(next);
        queueMicrotask(() => {
          setSelectedId((cur) =>
            cur !== pid ? cur : (next[0]?.id ?? null),
          );
        });
        return next;
      });
    },
    [authorId, persistPersonas],
  );

  const handlePersonasUpdateFromAi = useCallback(
    (next: Persona[]) => {
      setPersonas(next);
      if (authorIdRef.current) void persistPersonas(next);
    },
    [persistPersonas],
  );

  useEffect(() => {
    if (!authorId) {
      setOutlineNodes(createDefaultChapterOneNodes());
      return;
    }
    const ac = new AbortController();
    const docId = novelId;
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/update-structure?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(docId)}`,
          { signal: ac.signal },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as {
          nodes: PlotNode[] | null;
          updatedAt: string | null;
        };
        if (ac.signal.aborted) return;
        if (data.nodes && data.nodes.length > 0) {
          setOutlineNodes(data.nodes);
        } else {
          const chapterOne = createDefaultChapterOneNodes();
          setOutlineNodes(chapterOne);
          try {
            await fetch("/api/v1/update-structure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                authorId,
                docId: novelId,
                nodes: chapterOne,
              }),
            });
          } catch {
            /* 与 postOutlineStructure 一致：静默 */
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const [docTick, setDocTick] = useState(0);
  const [wakeup, setWakeup] = useState<{
    authorLabel: string;
    snippet: string;
    selectionJson: WritingContextPayload["selectionJson"];
    fallbackFrom: number;
    fallbackTo: number;
    scrollTop: number;
  } | null>(null);

  const editorInstance = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      SelectionLock,
      SimulationShortcut.configure({
        onModShiftA: (ed) => {
          openPanelRef.current(ed);
        },
      }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class:
          "max-w-none min-h-[320px] px-4 py-3 text-base leading-relaxed text-neutral-900 focus:outline-none dark:text-neutral-100 [&_p]:mb-3",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setDocTick((t) => t + 1);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        flushWritingContext(editor);
      }, 2000);
    },
  });

  useEffect(() => {
    editorInstanceRef.current = editorInstance ?? null;
  }, [editorInstance]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed || !authorId) return;

    const docId = novelId;
    const loadKey = `${authorId}:${docId}`;
    if (draftLoadedKeyRef.current === loadKey) return;

    const ac = new AbortController();

    void (async () => {
      try {
        const local = readWritingContextFromStorage(authorId, docId);
        if (
          local &&
          hasWritingPayload(local) &&
          !editorInstance.isDestroyed &&
          !ac.signal.aborted
        ) {
          applyRestoredContext(editorInstance, local);
          setDocTick((t) => t + 1);
        }

        const r = await fetch(
          `/api/v1/save-draft?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(docId)}`,
          { signal: ac.signal },
        );
        if (!r.ok || ac.signal.aborted || editorInstance.isDestroyed) return;

        const remoteRaw = (await r.json()) as Record<string, unknown>;
        if (ac.signal.aborted || editorInstance.isDestroyed) return;

        const merged = pickNewerWritingContext(local, remoteRaw);
        if (!merged || !hasWritingPayload(merged)) {
          draftLoadedKeyRef.current = loadKey;
          setWakeup(null);
          return;
        }

        const localTs = local?.lastActionTimestamp ?? -1;
        if (merged.lastActionTimestamp > localTs) {
          applyRestoredContext(editorInstance, merged);
          setDocTick((t) => t + 1);
        }

        draftLoadedKeyRef.current = loadKey;

        if (shouldShowWakeupBar(merged.lastActionTimestamp)) {
          setWakeup({
            authorLabel: formatAuthorLabel(authorId),
            snippet: merged.writingSnippet?.trim() || "……",
            selectionJson: merged.selectionJson,
            fallbackFrom: merged.selection?.from ?? 0,
            fallbackTo: merged.selection?.to ?? merged.selection?.from ?? 0,
            scrollTop: merged.viewportScroll ?? 0,
          });
        } else {
          setWakeup(null);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    })();

    return () => ac.abort();
  }, [editorInstance, authorId, novelId, applyRestoredContext]);

  const handleWakeupEnter = useCallback(() => {
    if (!editorInstance || editorInstance.isDestroyed || !wakeup) return;
    editorInstance.commands.focus();
    applySelectionToEditor(editorInstance, {
      selectionJson: wakeup.selectionJson,
      selection: { from: wakeup.fallbackFrom, to: wakeup.fallbackTo },
    });
    editorScrollRef.current?.scrollTo({
      top: Math.max(0, wakeup.scrollTop),
      behavior: "smooth",
    });
    setWakeup(null);
  }, [editorInstance, wakeup]);

  const handleOutlineSeek = useCallback(
    (range: { from: number; to: number }) => {
      const ed = editorInstance;
      if (!ed || ed.isDestroyed) return;
      const max = ed.state.doc.content.size;
      const from = Math.max(1, Math.min(range.from, max));
      ed.chain().focus().setTextSelection({ from, to: from }).scrollIntoView().run();
    },
    [editorInstance],
  );

  const selected = personas.find((p) => p.id === selectedId) ?? null;
  const showPersonaInspector = manageTab === "personas";
  const chapterNodes = useMemo(
    () => outlineNodes.filter((n) => n.kind === "chapter"),
    [outlineNodes],
  );
  const activeChapterIndex = useMemo(
    () =>
      activeChapterId ? chapterNodes.findIndex((c) => c.id === activeChapterId) : -1,
    [activeChapterId, chapterNodes],
  );

  useEffect(() => {
    if (chapterNodes.length === 0) {
      setActiveChapterId(null);
      return;
    }
    if (!activeChapterId || !chapterNodes.some((c) => c.id === activeChapterId)) {
      setActiveChapterId(chapterNodes[0].id);
    }
  }, [chapterNodes, activeChapterId]);

  const persistCurrentChapterContent = useCallback(() => {
    const ed = editorInstance;
    if (!ed || ed.isDestroyed || !activeChapterId) return outlineNodes;
    const currentHtml = ed.getHTML();
    return upsertChapterHtml(outlineNodes, activeChapterId, currentHtml);
  }, [editorInstance, activeChapterId, outlineNodes]);

  const jumpToChapter = useCallback(
    (chapter: PlotNode) => {
      const ed = editorInstance;
      const nextNodes = persistCurrentChapterContent();
      const target = nextNodes.find((n) => n.id === chapter.id);
      const targetHtml = chapterHtmlFromNode(target) ?? "<p></p>";
      setOutlineNodes(nextNodes);
      void postOutlineStructure(nextNodes);
      setActiveChapterId(chapter.id);
      if (!ed || ed.isDestroyed) return;
      ed.commands.setContent(targetHtml, { emitUpdate: true });
      setDocTick((t) => t + 1);
      flushWritingContext(ed);
      ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run();
    },
    [
      editorInstance,
      persistCurrentChapterContent,
      postOutlineStructure,
      flushWritingContext,
    ],
  );

  const handleDeleteChapter = useCallback(
    (chapterId: string) => {
      const target = chapterNodes.find((c) => c.id === chapterId);
      if (!target) return;
      if (!window.confirm(`确定删除章节「${target.title || "未命名章节"}」吗？`)) return;

      const currentNodes = persistCurrentChapterContent();
      const currentChapterNodes = currentNodes.filter((n) => n.kind === "chapter");
      const deleteIndex = currentChapterNodes.findIndex((n) => n.id === chapterId);
      if (deleteIndex < 0) return;

      const nextNodes = currentNodes.filter((n) => n.id !== chapterId);
      const nextChapterNodes = nextNodes.filter((n) => n.kind === "chapter");
      setOutlineNodes(nextNodes);
      void postOutlineStructure(nextNodes);

      setPublishRecord((prev) => {
        if (!prev?.publishedChapterIds?.includes(chapterId)) return prev;
        return {
          ...prev,
          publishedChapterIds: prev.publishedChapterIds.filter((id) => id !== chapterId),
        };
      });

      const ed = editorInstance;
      if (nextChapterNodes.length === 0) {
        setActiveChapterId(null);
        if (!ed || ed.isDestroyed) return;
        ed.commands.setContent("<p></p>", { emitUpdate: true });
        setDocTick((t) => t + 1);
        flushWritingContext(ed);
        ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run();
        return;
      }

      if (activeChapterId !== chapterId) {
        return;
      }

      const fallback =
        nextChapterNodes[Math.min(deleteIndex, nextChapterNodes.length - 1)] ??
        nextChapterNodes[0];
      const fallbackHtml = chapterHtmlFromNode(fallback) ?? "<p></p>";
      setActiveChapterId(fallback.id);
      if (!ed || ed.isDestroyed) return;
      ed.commands.setContent(fallbackHtml, { emitUpdate: true });
      setDocTick((t) => t + 1);
      flushWritingContext(ed);
      ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run();
    },
    [
      chapterNodes,
      persistCurrentChapterContent,
      postOutlineStructure,
      editorInstance,
      flushWritingContext,
      activeChapterId,
    ],
  );

  const addAndJumpNextChapter = useCallback(() => {
    const nums = chapterNodes
      .map((c) => parseChapterNoFromTitle(c.title))
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const nextNo = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    const title = buildChapterTitle(nextNo);

    const nextNodes = persistCurrentChapterContent();
    let parentVolumeId = nextNodes.find((n) => n.kind === "volume")?.id;
    if (!parentVolumeId) {
      const vId = makePlotNodeId("plot-volume");
      nextNodes.push({
        id: vId,
        kind: "volume",
        title: "",
        summary: "",
      });
      parentVolumeId = vId;
    }

    const newChapter: PlotNode = {
      id: makePlotNodeId("plot-chapter"),
      kind: "chapter",
      title,
      summary: "",
      tags: [],
      parentId: parentVolumeId,
      metadata: { chapterHtml: "<p></p>" },
    };
    nextNodes.push(newChapter);
    setOutlineNodes(nextNodes);
    void postOutlineStructure(nextNodes);
    setActiveChapterId(newChapter.id);

    const ed = editorInstance;
    if (!ed || ed.isDestroyed) return;
    ed.commands.setContent("<p></p>", { emitUpdate: true });
    setDocTick((t) => t + 1);
    flushWritingContext(ed);
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run();
  }, [
    chapterNodes,
    persistCurrentChapterContent,
    postOutlineStructure,
    editorInstance,
    flushWritingContext,
  ]);

  const handlePrevChapter = useCallback(() => {
    if (activeChapterIndex <= 0) return;
    const prev = chapterNodes[activeChapterIndex - 1];
    if (prev) jumpToChapter(prev);
  }, [activeChapterIndex, chapterNodes, jumpToChapter]);

  const handleNextChapter = useCallback(() => {
    if (chapterNodes.length === 0) {
      addAndJumpNextChapter();
      return;
    }
    if (activeChapterIndex >= 0 && activeChapterIndex < chapterNodes.length - 1) {
      const next = chapterNodes[activeChapterIndex + 1];
      if (next) jumpToChapter(next);
      return;
    }
    addAndJumpNextChapter();
  }, [chapterNodes, activeChapterIndex, jumpToChapter, addAndJumpNextChapter]);

  const manuscriptPlain = useMemo(() => {
    if (!editorInstance) return "";
    return editorInstance.getText({ blockSeparator: "\n\n" });
    // docTick：onUpdate / 恢复快照后递增，驱动此处与文档同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorInstance, docTick]);

  /** 发布模块：正文篇幅 + 大纲标题达标后才可首次发布 */
  const publishContentReady = useMemo(() => {
    const t = manuscriptPlain.replace(/\s/g, "");
    const minChars = 80;
    const hasOutline =
      outlineNodes.length > 0 &&
      outlineNodes.some((n) => (n.title?.trim()?.length ?? 0) > 0);
    return t.length >= minChars && hasOutline;
  }, [manuscriptPlain, outlineNodes]);

  const hasPublishSave = Boolean(publishRecord?.publishedAt);
  const canOpenPublish =
    Boolean(authorId) && (publishContentReady || hasPublishSave);
  const isCurrentChapterPublished = Boolean(
    activeChapterId && publishedChapterIdSet.has(activeChapterId),
  );
  const isPublishedChapterReadOnly =
    isCurrentChapterPublished && chapterEditTab !== "edit";

  useEffect(() => {
    if (!authorId || !novelId) {
      setPaymentQrImage(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      setPaymentQrLoading(true);
      try {
        const r = await fetch(
          `/api/v1/author-payment-qr?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          { signal: ac.signal },
        );
        if (!r.ok || ac.signal.aborted) return;
        const data = (await r.json()) as { record?: { imageDataUrl?: string } | null };
        if (ac.signal.aborted) return;
        setPaymentQrImage(data.record?.imageDataUrl ?? null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setPaymentQrLoading(false);
      }
    })();
    return () => ac.abort();
  }, [authorId, novelId]);

  const handleUploadPaymentQr = useCallback(
    async (file: File) => {
      if (!authorId) {
        window.alert("请先连接钱包");
        return;
      }
      if (!file.type.startsWith("image/")) {
        window.alert("仅允许上传图片格式文件");
        return;
      }
      const readAsDataUrl = () =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") {
              reject(new Error("读取图片失败"));
              return;
            }
            resolve(reader.result);
          };
          reader.onerror = () => reject(new Error("读取图片失败"));
          reader.readAsDataURL(file);
        });

      setPaymentQrSaving(true);
      try {
        const imageDataUrl = await readAsDataUrl();
        const r = await fetch("/api/v1/author-payment-qr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({
            authorId,
            novelId,
            imageDataUrl,
          }),
        });
        const data = (await r.json()) as {
          record?: { imageDataUrl?: string };
          error?: string;
        };
        if (!r.ok) throw new Error(data.error ?? "上传失败");
        setPaymentQrImage(data.record?.imageDataUrl ?? imageDataUrl);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "上传失败");
      } finally {
        setPaymentQrSaving(false);
      }
    },
    [authorId, novelId],
  );

  const handleDeletePaymentQr = useCallback(async () => {
    if (!authorId) {
      window.alert("请先连接钱包");
      return;
    }
    if (!window.confirm("确定删除当前收款码吗？")) return;
    setPaymentQrSaving(true);
    try {
      const r = await fetch(
        `/api/v1/author-payment-qr?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
        {
          method: "DELETE",
          headers: { "x-wallet-address": authorId },
        },
      );
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) throw new Error(data.error ?? "删除失败");
      setPaymentQrImage(null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setPaymentQrSaving(false);
    }
  }, [authorId, novelId]);

  const handleSimClose = useCallback(() => {
    editorInstance?.commands.clearSelectionLock();
    setDeduceContext(null);
    setSimOpen(false);
  }, [editorInstance]);

  const handleExportTxt = useCallback(() => {
    if (!authorId || !editorInstance || editorInstance.isDestroyed) return;
    const text = editorInstance.getText({ blockSeparator: "\n\n" });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const nid = novelId.replace(/[^\w.-]+/g, "_").slice(0, 48);
    a.download = `chenchen-${nid}-${authorId.slice(0, 10)}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [authorId, editorInstance, novelId]);

  const openImportTxtPicker = useCallback(() => {
    if (!authorId) return;
    importTxtInputRef.current?.click();
  }, [authorId]);

  const applyRenderedHtmlToEditor = useCallback(
    (renderedHtml: string) => {
      if (!editorInstance || editorInstance.isDestroyed) return;
      const html = renderedHtml.trim() || "<p></p>";
      editorInstance.commands.setContent(html, { emitUpdate: true });
      setDocTick((t) => t + 1);
      flushWritingContext(editorInstance);
    },
    [editorInstance, flushWritingContext],
  );

  const publishCurrentChapterFromMarkdown = useCallback(
    async (renderedHtml: string) => {
      if (!authorId || !activeChapterId) {
        throw new Error("请先选择章节并连接钱包");
      }
      const html = renderedHtml.trim() || "<p></p>";
      const nextNodes = upsertChapterHtml(outlineNodes, activeChapterId, html);
      setOutlineNodes(nextNodes);
      applyRenderedHtmlToEditor(html);
      await postOutlineStructure(nextNodes);
      await toggleCurrentChapterPublish(true, { layoutMode: "preserve" });
    },
    [
      authorId,
      activeChapterId,
      outlineNodes,
      applyRenderedHtmlToEditor,
      postOutlineStructure,
      toggleCurrentChapterPublish,
    ],
  );

  const openMarkdownEditor = useCallback(() => {
    if (!authorId || !editorInstance || editorInstance.isDestroyed) return;
    const currentHtml = editorInstance.getHTML();
    const markdownSeed = htmlToMarkdownSeed(currentHtml);
    const popup = window.open(
      "",
      "_blank",
      "popup=yes,width=1360,height=900,resizable=yes,scrollbars=yes",
    );
    if (!popup) {
      window.alert("浏览器拦截了新窗口，请允许弹窗后重试。");
      return;
    }
    popup.document.open();
    popup.document.write(buildMarkdownEditorWindowHtml(markdownSeed));
    popup.document.close();
    popup.focus();
    markdownEditorPopupRef.current = popup;
  }, [authorId, editorInstance]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== markdownEditorPopupRef.current) return;
      if (!event.data || typeof event.data !== "object") return;
      const payload = event.data as {
        type?: unknown;
        markdown?: unknown;
        renderedHtml?: unknown;
      };
      if (payload.type !== MARKDOWN_EDITOR_POPUP_MESSAGE_TYPE) return;
      const renderedHtml =
        typeof payload.renderedHtml === "string"
          ? payload.renderedHtml
          : typeof payload.markdown === "string"
            ? ((marked.parse(payload.markdown, { breaks: true }) as string) ?? "")
            : "";
      void publishCurrentChapterFromMarkdown(renderedHtml).catch((e) => {
        window.alert(e instanceof Error ? e.message : "发布失败");
      });
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (markdownEditorPopupRef.current && !markdownEditorPopupRef.current.closed) {
        markdownEditorPopupRef.current.close();
      }
      markdownEditorPopupRef.current = null;
    };
  }, [publishCurrentChapterFromMarkdown]);

  const openAiImportTxtPicker = useCallback(() => {
    if (!authorId || aiChapterizing) return;
    aiImportTxtInputRef.current?.click();
  }, [authorId, aiChapterizing]);

  const handleImportTxtSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!authorId || !file || !editorInstance || editorInstance.isDestroyed) {
        return;
      }
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".txt")) {
        window.alert("仅支持导入 .txt 文本文件。");
        return;
      }
      if (
        !window.confirm(
          "导入将以该 .txt 内容替换当前稿面（可先导出备份）。是否继续？",
        )
      ) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (!(result instanceof ArrayBuffer)) {
          window.alert("读取文件失败：无效的文件内容。");
          return;
        }
        const text = decodeTxtAuto(new Uint8Array(result));
        if (!editorInstance || editorInstance.isDestroyed) return;
        const html = plainTextToTipTapHtml(text);
        editorInstance.commands.setContent(html, { emitUpdate: true });
        setDocTick((t) => t + 1);
        flushWritingContext(editorInstance);
      };
      reader.onerror = () => {
        window.alert("读取文件失败，请重试。");
      };
      reader.readAsArrayBuffer(file);
    },
    [authorId, editorInstance, flushWritingContext],
  );

  const handleAiImportTxtSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!authorId || !file || !editorInstance || editorInstance.isDestroyed) return;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".txt")) {
        window.alert("仅支持导入 .txt 文本文件。");
        return;
      }
      if (
        !window.confirm(
          "将调用 DeepSeek 自动排版并切分章节，此操作会覆盖当前章节结构和稿面内容。是否继续？",
        )
      ) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (!(result instanceof ArrayBuffer)) {
          window.alert("读取文件失败：无效的文件内容。");
          return;
        }
        const text = decodeTxtAuto(new Uint8Array(result));
        void (async () => {
          setAiChapterizing(true);
          try {
            const r = await fetch("/api/v1/ai/chapterize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text }),
            });
            const data = (await r.json()) as {
              chapters?: Array<{ title: string; content: string }>;
              error?: string;
              usedFallback?: boolean;
            };
            if (!r.ok || !Array.isArray(data.chapters) || data.chapters.length === 0) {
              throw new Error(data.error ?? "AI 切章失败");
            }

            const volumeId = makePlotNodeId("plot-volume");
            const nextNodes: PlotNode[] = [
              {
                id: volumeId,
                kind: "volume",
                title: "",
                summary: "",
              },
              ...data.chapters.map((ch, idx) => ({
                id: makePlotNodeId("plot-chapter"),
                kind: "chapter" as const,
                title: (ch.title || "").trim() || `第${idx + 1}章`,
                summary: "",
                tags: [],
                parentId: volumeId,
                metadata: {
                  chapterHtml: plainTextToTipTapHtml(ch.content || ""),
                },
              })),
            ];

            setOutlineNodes(nextNodes);
            void postOutlineStructure(nextNodes);

            const firstChapter = nextNodes.find((n) => n.kind === "chapter");
            const firstHtml = firstChapter
              ? chapterHtmlFromNode(firstChapter) ?? "<p></p>"
              : "<p></p>";
            if (firstChapter) setActiveChapterId(firstChapter.id);
            editorInstance.commands.setContent(firstHtml, { emitUpdate: true });
            setDocTick((t) => t + 1);
            flushWritingContext(editorInstance);

            if (data.usedFallback) {
              window.alert("DeepSeek 返回异常，已使用本地规则完成基础切章。");
            }
          } catch (err) {
            window.alert(err instanceof Error ? err.message : "AI 切章失败");
          } finally {
            setAiChapterizing(false);
          }
        })();
      };
      reader.onerror = () => {
        window.alert("读取文件失败，请重试。");
      };
      reader.readAsArrayBuffer(file);
    },
    [authorId, editorInstance, flushWritingContext, postOutlineStructure],
  );

  const uploadToImageHost = useCallback(
    async (payload: { files?: File[]; zip?: File }) => {
      if (!authorId) throw new Error("请先连接钱包");
      const form = new FormData();
      for (const f of payload.files ?? []) {
        form.append("files", f);
      }
      if (payload.zip) {
        form.append("zip", payload.zip);
      }
      const r = await fetch("/api/v1/image-host", {
        method: "POST",
        headers: { "x-wallet-address": authorId },
        body: form,
      });
      const data = (await r.json()) as {
        items?: Array<{ name: string; url: string }>;
        error?: string;
      };
      if (!r.ok || !Array.isArray(data.items)) {
        throw new Error(data.error ?? "图片上传失败");
      }
      return data.items;
    },
    [authorId],
  );

  const insertUploadedImages = useCallback(
    (items: Array<{ name: string; url: string }>) => {
      if (!editorInstance || editorInstance.isDestroyed || items.length === 0) return;
      const chain = editorInstance.chain().focus();
      for (const item of items) {
        chain.setImage({ src: item.url, alt: item.name, title: item.name }).createParagraphNear();
      }
      chain.run();
      setDocTick((t) => t + 1);
      flushWritingContext(editorInstance);
    },
    [editorInstance, flushWritingContext],
  );

  const buildMarkdownForItems = useCallback(
    (items: Array<{ name: string; url: string }>) =>
      items.map((i) => `![${i.name}](${i.url})`).join("\n\n"),
    [],
  );

  const handleEditorPasteUpload = useCallback(
    async (e: ClipboardEvent<HTMLDivElement>) => {
      if (!authorId || isPublishedChapterReadOnly) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const imageFiles = Array.from(dt.items)
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (imageFiles.length === 0) return;
      e.preventDefault();
      setUploadingImages(true);
      setImageUploadError(null);
      try {
        const items = await uploadToImageHost({ files: imageFiles });
        setUploadedImageItems((prev) => [...items, ...prev].slice(0, 40));
        insertUploadedImages(items);
      } catch (err) {
        setImageUploadError(err instanceof Error ? err.message : "图片上传失败");
      } finally {
        setUploadingImages(false);
      }
    },
    [authorId, insertUploadedImages, isPublishedChapterReadOnly, uploadToImageHost],
  );

  const openZipPicker = useCallback(() => {
    if (!authorId) return;
    uploadZipInputRef.current?.click();
  }, [authorId]);

  const openImagePicker = useCallback(() => {
    if (!authorId) return;
    uploadImageInputRef.current?.click();
  }, [authorId]);

  const handleZipSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploadingImages(true);
      setImageUploadError(null);
      try {
        const items = await uploadToImageHost({ zip: file });
        setUploadedImageItems((prev) => [...items, ...prev].slice(0, 80));
        if (items.length > 0) {
          // Best-effort auto-copy. Some browsers block async clipboard writes
          // outside strict user gesture context; users can always click copy buttons.
          await copyText(buildMarkdownForItems(items));
        }
      } catch (err) {
        setImageUploadError(err instanceof Error ? err.message : "压缩包上传失败");
      } finally {
        setUploadingImages(false);
      }
    },
    [buildMarkdownForItems, uploadToImageHost],
  );

  const handleImageFilesSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      setUploadingImages(true);
      setImageUploadError(null);
      try {
        const items = await uploadToImageHost({ files });
        setUploadedImageItems((prev) => [...items, ...prev].slice(0, 80));
        insertUploadedImages(items);
      } catch (err) {
        setImageUploadError(err instanceof Error ? err.message : "图片上传失败");
      } finally {
        setUploadingImages(false);
      }
    },
    [insertUploadedImages, uploadToImageHost],
  );

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed) return;
    if (!simOpen) {
      editorInstance.commands.clearSelectionLock();
      return;
    }
    if (deduceContext) {
      editorInstance.commands.setSelectionLock({
        from: deduceContext.selectionFrom,
        to: deduceContext.selectionTo,
      });
    } else {
      editorInstance.commands.clearSelectionLock();
    }
  }, [simOpen, deduceContext, editorInstance]);

  useEffect(() => {
    if (!activeChapterId) {
      setChapterEditTab("edit");
      return;
    }
    setChapterEditTab(isCurrentChapterPublished ? "read" : "edit");
  }, [activeChapterId, isCurrentChapterPublished]);

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed) return;
    editorInstance.setEditable(!isPublishedChapterReadOnly);
  }, [editorInstance, isPublishedChapterReadOnly]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
      {manageTab === "personas" ? (
        <PersonaSidebar
          personas={personas}
          selectedId={selectedId}
          onSelect={setSelectedId}
          walletConnected={Boolean(authorId)}
          onAdd={handleAddPersona}
          onDelete={handleDeletePersona}
        />
      ) : (
        <OutlineSidebar
          nodes={outlineNodes}
          onNodesChange={setOutlineNodes}
          onUpdateStructure={postOutlineStructure}
          onNodeSeek={handleOutlineSeek}
          onChapterSelect={(chapterId) => {
            const chapter = chapterNodes.find((c) => c.id === chapterId);
            if (chapter) jumpToChapter(chapter);
          }}
          activeChapterId={activeChapterId}
          onDeleteChapter={handleDeleteChapter}
          publishStatusLabel={authorId ? publishStatusLabelText : null}
          onWithdrawPublish={
            canWithdrawPublish ? handleWithdrawPublish : undefined
          }
          withdrawPublishDisabled={!authorId}
          publishedChapterIds={publishRecord?.publishedChapterIds ?? []}
          chapterPublishDisabled={displayPublishStatus === "draft"}
          onToggleChapterPublish={(chapterId, publish) => {
            if (chapterPublishSubmitting) return;
            return (async () => {
              if (!authorId) return;
              setChapterPublishSubmitting(true);
              try {
                await persistActiveChapterBeforePublish();
                const r = await fetch("/api/v1/novel-publish", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": authorId,
                  },
                  body: JSON.stringify({
                    action: "toggle_chapter",
                    authorId,
                    novelId,
                    chapterId,
                    publish,
                    layoutMode: publishLayoutMode,
                  }),
                });
                const data = (await r.json()) as {
                  record?: NovelPublishRecord;
                  error?: string;
                };
                if (!r.ok) throw new Error(data.error ?? "章节发布操作失败");
                setPublishRecord(data.record ?? null);
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "章节发布操作失败");
              } finally {
                setChapterPublishSubmitting(false);
              }
            })();
          }}
          onPublishAllChapters={() => {
            if (chapterPublishSubmitting) return;
            return (async () => {
              if (!authorId) return;
              const allChapterIds = outlineNodes
                .filter((n) => n.kind === "chapter")
                .map((n) => n.id);
              if (allChapterIds.length === 0) {
                window.alert("当前没有可发布章节");
                return;
              }
              setChapterPublishSubmitting(true);
              try {
                const latestNodes = await persistActiveChapterBeforePublish();
                const latestChapterIds = latestNodes
                  .filter((n) => n.kind === "chapter")
                  .map((n) => n.id);
                const r = await fetch("/api/v1/novel-publish", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-wallet-address": authorId,
                  },
                  body: JSON.stringify({
                    action: "publish_all_chapters",
                    authorId,
                    novelId,
                    allChapterIds: latestChapterIds,
                    layoutMode: publishLayoutMode,
                  }),
                });
                const data = (await r.json()) as {
                  record?: NovelPublishRecord;
                  error?: string;
                };
                if (!r.ok) throw new Error(data.error ?? "一键发布全部章节失败");
                setPublishRecord(data.record ?? null);
                window.alert("已发布全部章节");
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "一键发布全部章节失败");
              } finally {
                setChapterPublishSubmitting(false);
              }
            })();
          }}
          publishAllChaptersDisabled={
            chapterPublishSubmitting ||
            displayPublishStatus === "draft" ||
            chapterNodes.length === 0
          }
        />
      )}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-[var(--background)] px-4 py-2 dark:border-neutral-800">
          <div>
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <Link
                href="/workspace"
                className="text-[11px] font-medium text-neutral-500 underline-offset-4 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                ← 工作台
              </Link>
            </div>
            <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {novelTitleForHeader ?? "稿面"}
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-900">
                ⌘
              </kbd>
              <span className="mx-0.5">+</span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-900">
                ⇧
              </kbd>
              <span className="mx-0.5">+</span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-900">
                A
              </kbd>
              <span className="ml-1">
                捕获选区并打开推演（Windows：Ctrl+Shift+A，需在编辑器内聚焦）
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setManageTab("personas")}
                className={
                  manageTab === "personas"
                    ? "rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white"
                    : "rounded-md border border-neutral-300 px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
                }
              >
                角色设定管理
              </button>
              <button
                type="button"
                onClick={() => {
                  setManageTab("outline");
                  if (!activeChapterId) return;
                  const chapter = chapterNodes.find((c) => c.id === activeChapterId);
                  if (chapter) jumpToChapter(chapter);
                }}
                className={
                  manageTab === "outline"
                    ? "rounded-md bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white"
                    : "rounded-md border border-neutral-300 px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
                }
              >
                剧情大纲管理
              </button>
              <button
                type="button"
                onClick={() => setManageTab("finance")}
                className={
                  manageTab === "finance"
                    ? "rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white"
                    : "rounded-md border border-neutral-300 px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
                }
              >
                财务管理
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WalletConnect />
            <input
              ref={uploadZipInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              aria-hidden
              onChange={(e) => void handleZipSelected(e)}
            />
            <input
              ref={uploadImageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-hidden
              onChange={(e) => void handleImageFilesSelected(e)}
            />
            <input
              ref={importTxtInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              aria-hidden
              onChange={handleImportTxtSelected}
            />
            <input
              ref={aiImportTxtInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              aria-hidden
              onChange={handleAiImportTxtSelected}
            />
            <button
              type="button"
              disabled={!authorId || isPublishedChapterReadOnly}
              onClick={openImportTxtPicker}
              title={
                !authorId
                  ? "请先连接钱包后再导入文稿"
                  : isPublishedChapterReadOnly
                    ? "当前章节已发布且为只读，请切换到“编辑”后再导入"
                    : authorId
                  ? "导入 .txt 替换当前稿面（自动识别 UTF-8 / GB18030 / UTF-16）"
                  : ""
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              导入小说
            </button>
            <button
              type="button"
              disabled={!authorId || aiChapterizing || isPublishedChapterReadOnly}
              onClick={openAiImportTxtPicker}
              title={
                !authorId
                  ? "请先连接钱包后再导入文稿"
                  : isPublishedChapterReadOnly
                    ? "当前章节已发布且为只读，请切换到“编辑”后再导入"
                    : authorId
                  ? "调用 DeepSeek 自动排版并切分为第一章、第二章..."
                  : ""
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {aiChapterizing ? "AI 切章中…" : "AI智能切章导入"}
            </button>
            <button
              type="button"
              disabled={!authorId}
              onClick={handleExportTxt}
              title={
                authorId
                  ? "导出当前稿面为 .txt（段落间空行）"
                  : "请先连接钱包后再导出文稿"
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              导出小说
            </button>
            <button
              type="button"
              disabled={!authorId || isPublishedChapterReadOnly}
              onClick={openMarkdownEditor}
              title={
                !authorId
                  ? "请先连接钱包"
                  : isPublishedChapterReadOnly
                    ? "当前章节已发布且为只读，请切换到“编辑”后再使用 Markdown 编辑器"
                    : "打开 Markdown 编辑器（支持表格）"
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Markdown编辑器
            </button>
            <button
              type="button"
              disabled={!authorId || uploadingImages || isPublishedChapterReadOnly}
              onClick={openImagePicker}
              title={
                !authorId
                  ? "请先连接钱包后再上传图片"
                  : isPublishedChapterReadOnly
                    ? "当前章节已发布且为只读，请切换到“编辑”后再上传图片"
                    : authorId
                  ? "上传图片并自动插入 Markdown 图片语法"
                  : ""
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {uploadingImages ? "上传中…" : "上传图片"}
            </button>
            <button
              type="button"
              disabled={!authorId || uploadingImages || isPublishedChapterReadOnly}
              onClick={openZipPicker}
              title={
                !authorId
                  ? "请先连接钱包后再上传图片压缩包"
                  : isPublishedChapterReadOnly
                    ? "当前章节已发布且为只读，请切换到“编辑”后再上传图片压缩包"
                    : "上传图片压缩包（zip）并生成可访问链接"
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {uploadingImages ? "上传中…" : "上传图片压缩包"}
            </button>
            {/** 发布模块 — 主操作按钮（已保存配置后文案为「已发布」） */}
            <button
              type="button"
              disabled={!authorId || !canOpenPublish}
              onClick={() => setPublishModalOpen(true)}
              title={
                !authorId
                  ? "请先连接钱包"
                  : !canOpenPublish
                    ? "请完成小说内容后再发布（正文约 80 字以上且大纲含有效标题）"
                    : hasPublishSave
                      ? "查看或修改发布设置"
                      : "打开发布配置"
              }
              className={[
                "inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-transform disabled:cursor-not-allowed disabled:opacity-45",
                hasPublishSave
                  ? "bg-neutral-500 text-white hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-500"
                  : "bg-[#2196f3] text-white hover:scale-[1.04] hover:bg-[#1976d2] active:scale-[0.98]",
              ].join(" ")}
            >
              <Rocket className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {hasPublishSave ? "已发布" : "发布小说"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (editorInstance && !editorInstance.isDestroyed) {
                  openPanelWithEditorContext(editorInstance);
                } else {
                  editorInstance?.commands.clearSelectionLock();
                  setDeduceContext(null);
                  setSimOpen(true);
                }
              }}
              className="pointer-events-auto relative z-40 cursor-pointer rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              AI 推演
            </button>
          </div>
        </header>
        {wakeup ? (
          <div
            role="region"
            aria-label="续写提示"
            className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50/90 px-4 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-50"
          >
            <p className="min-w-0 leading-relaxed">
              欢迎回来，{wakeup.authorLabel}
              。上次你写到了 {wakeup.snippet}
            </p>
            <button
              type="button"
              onClick={handleWakeupEnter}
              className="shrink-0 rounded-md border border-amber-700/30 bg-white/90 px-3 py-1 text-xs font-medium text-amber-950 shadow-sm transition-colors hover:bg-white dark:border-amber-600/40 dark:bg-amber-900/80 dark:text-amber-50 dark:hover:bg-amber-900"
            >
              一键入戏
            </button>
          </div>
        ) : null}
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setChapterEditTab("read")}
                className={
                  chapterEditTab === "read"
                    ? "rounded-md bg-neutral-700 px-2 py-1 text-[11px] font-medium text-white dark:bg-neutral-200 dark:text-neutral-900"
                    : "rounded-md border border-neutral-400 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                }
              >
                阅读
              </button>
              <button
                type="button"
                onClick={() => setChapterEditTab("edit")}
                className={
                  chapterEditTab === "edit"
                    ? "rounded-md bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white"
                    : "rounded-md border border-cyan-500/40 px-2 py-1 text-[11px] text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40"
                }
              >
                编辑
              </button>
              {isCurrentChapterPublished && chapterEditTab === "read" ? (
                <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-300">
                  已发布章节默认只读，点击“编辑”可修改
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>图片支持：在编辑器内可直接按 Ctrl+V 粘贴截图自动上传。</p>
            {uploadedImageItems.length > 0 ? (
              <button
                type="button"
                onClick={async () => {
                  const allMd = buildMarkdownForItems(uploadedImageItems);
                  const ok = await copyText(allMd);
                  window.alert(ok ? "已复制全部 Markdown 图片地址" : "复制失败，请手动复制列表内容");
                }}
                className="rounded border border-neutral-400 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
              >
                复制全部Markdown
              </button>
            ) : null}
            {uploadedImageItems.length > 0 ? (
              <button
                type="button"
                onClick={async () => {
                  const all = uploadedImageItems.map((i) => i.url).join("\n");
                  const ok = await copyText(all);
                  window.alert(ok ? "已复制全部图片链接" : "复制失败，请手动复制列表内容");
                }}
                className="rounded border border-neutral-400 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
              >
                复制全部链接
              </button>
            ) : null}
          </div>
          {imageUploadError ? (
            <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{imageUploadError}</p>
          ) : null}
          {uploadedImageItems.length > 0 ? (
            <div className="mt-2 max-h-24 overflow-y-auto rounded border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950">
              {uploadedImageItems.slice(0, 12).map((it) => (
                <div key={`${it.url}-${it.name}`} className="mb-1 flex items-center gap-2 last:mb-0">
                  <span className="w-24 shrink-0 truncate text-[11px] text-neutral-500">{it.name}</span>
                  <code className="min-w-0 flex-1 truncate text-[11px]">{it.url}</code>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyText(it.url);
                      window.alert(ok ? "图片链接已复制" : "复制失败，请手动复制");
                    }}
                    className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const md = `![${it.name}](${it.url})`;
                      const ok = await copyText(md);
                      window.alert(ok ? "Markdown 已复制" : "复制失败，请手动复制");
                    }}
                    className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                  >
                    复制Markdown
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div
          className={[
            "grid min-h-0 flex-1 grid-cols-1 gap-0",
            showPersonaInspector
              ? "lg:grid-cols-[1fr_280px]"
              : "lg:grid-cols-1",
          ].join(" ")}
        >
          <div
            ref={editorScrollRef}
            onPasteCapture={(e) => {
              void handleEditorPasteUpload(e);
            }}
            className={[
              "relative z-0 min-h-0 overflow-y-auto border-b border-neutral-200 dark:border-neutral-800 lg:border-b-0",
              showPersonaInspector ? "lg:border-r" : "",
            ].join(" ")}
          >
            {editorInstance && <EditorContent editor={editorInstance} />}
          </div>
          {showPersonaInspector ? (
            <div className="overflow-y-auto p-4">
              <PersonaDetailCard
                persona={selected}
                onPersonaChange={handlePersonaDetailChange}
              />
            </div>
          ) : manageTab === "finance" ? (
            <div className="overflow-y-auto border-l border-neutral-200 p-4 dark:border-neutral-800">
              <div className="rounded-xl border border-[#2b405f] bg-[#0b1320] p-4">
                <h3 className="text-sm font-semibold text-amber-300">收款码上传</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  仅支持图片格式（png/jpg/webp/gif）。读者侧“打赏作者”会展示此收款码。
                </p>
                <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-amber-500/50 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-950/30">
                  {paymentQrSaving ? "上传中…" : "选择收款码图片"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (!file) return;
                      void handleUploadPaymentQr(file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!paymentQrImage || paymentQrSaving}
                  onClick={() => void handleDeletePaymentQr()}
                  className="ml-2 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  删除收款码
                </button>
                <div className="mt-4">
                  {paymentQrLoading ? (
                    <p className="text-xs text-zinc-400">加载中…</p>
                  ) : paymentQrImage ? (
                    <img
                      src={paymentQrImage}
                      alt="作者收款码"
                      className="max-h-72 rounded-md border border-zinc-700"
                    />
                  ) : (
                    <p className="text-xs text-zinc-500">暂未上传收款码</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {activeChapterIndex >= 0
              ? `当前章节：${chapterNodes[activeChapterIndex]?.title ?? "未命名章节"}`
              : "当前章节：未设置"}
            {activeChapterIndex >= 0 && displayPublishStatus !== "draft" ? (
              <span
                className={
                  isCurrentChapterPublished
                    ? "ml-2 rounded bg-emerald-600/20 px-1.5 py-0.5 text-emerald-500"
                    : "ml-2 rounded bg-amber-600/20 px-1.5 py-0.5 text-amber-500"
                }
              >
                {isCurrentChapterPublished ? "已发布" : "未发布"}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {activeChapterIndex >= 0 ? (
              <button
                type="button"
                disabled={chapterPublishSubmitting || displayPublishStatus === "draft"}
                onClick={() => void toggleCurrentChapterPublish(!isCurrentChapterPublished)}
                className="rounded-md border border-emerald-500/40 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                {chapterPublishSubmitting
                  ? "处理中…"
                  : isCurrentChapterPublished
                    ? "撤回本章"
                    : "发布本章"}
              </button>
            ) : null}
            {activeChapterIndex > 0 ? (
              <button
                type="button"
                onClick={handlePrevChapter}
                className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                上一章
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleNextChapter}
              className="rounded-md border border-cyan-500/50 px-3 py-1 text-xs text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40"
            >
              下一章
            </button>
          </div>
        </div>
      </main>
      <PublishNovelModal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        novelTitle={novelTitleForHeader ?? "未命名作品"}
        initialSynopsis={publishModalInitialSynopsis}
        initialTags={publishModalInitialTags}
        savedRecord={publishRecord}
        onAutoFillMeta={handleAutoFillPublishMeta}
        onConfirm={handlePublishConfirm}
      />
      <SimulationPanel
        open={simOpen}
        onClose={handleSimClose}
        manuscript={manuscriptPlain}
        personas={personas}
        context={deduceContext}
        onPersonasUpdate={handlePersonasUpdateFromAi}
        editor={editorInstance}
      />
    </div>
  );
}
