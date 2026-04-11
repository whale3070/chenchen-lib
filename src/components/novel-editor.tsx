"use client";

import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
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
import { useSearchParams } from "next/navigation";

import { OutlineSidebar } from "@/components/outline-sidebar";
import { PublishNovelModal } from "@/components/publish-novel-modal";
import { PersonaDetailCard } from "@/components/persona-detail";
import {
  PersonaSidebar,
  type PersonaSidebarMode,
} from "@/components/persona-sidebar";
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
import { htmlFragmentToGfmMarkdown } from "@/lib/html-to-gfm-markdown";
import { plainTextToTipTapHtml } from "@/lib/manuscript-txt";
import { makePlotNodeId } from "@/lib/plot-nodes-from-chapters";
import {
  chapterizeTxtViaApi,
  decodeTxtAuto,
  type ChapterizeTxtMode,
} from "@/lib/txt-import-chapterize";
import { resolveParentForNewChapter } from "@/lib/plot-outline";
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

const AI_REFLOW_BACKGROUND_MSG =
  "AI 正在后台排版，请耐心等待。排版完成后会再次提示您。此期间可继续编辑；请勿中断服务器进程。";

/** 让发布弹窗先结束 submitting / 关掉弹窗，再弹出系统提示；并立刻开始轮询排版状态 */
function scheduleAiReflowBackgroundNotify(startWatch: () => void) {
  startWatch();
  window.setTimeout(() => {
    window.alert(AI_REFLOW_BACKGROUND_MSG);
  }, 0);
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
const TRANSLATION_EDITOR_SESSION_PREFIX = "translation-editor-pair:";
type ChapterizeMode = ChapterizeTxtMode;
const WORKSPACE_RESUME_PREFIX = "chenchen:workspace:resume:";
type ManageTab = "personas" | "outline" | "finance";
type WorkspaceResumeState = {
  activeChapterId?: string | null;
  manageTab?: ManageTab;
  updatedAt: number;
};

function workspaceResumeKey(authorId: string, docId: string): string {
  return `${WORKSPACE_RESUME_PREFIX}${authorId.toLowerCase()}:${docId}`;
}

function readWorkspaceResumeState(
  authorId: string,
  docId: string,
): WorkspaceResumeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(workspaceResumeKey(authorId, docId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceResumeState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWorkspaceResumeState(
  authorId: string,
  docId: string,
  payload: WorkspaceResumeState,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      workspaceResumeKey(authorId, docId),
      JSON.stringify(payload),
    );
  } catch {
    // ignore private mode / quota
  }
}

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

/** 从 Markdown 弹窗保存的原文；与 chapterHtml 同步维护 */
function chapterMarkdownFromNode(node: PlotNode | undefined): string | null {
  if (!node?.metadata || typeof node.metadata !== "object") return null;
  const raw = (node.metadata as Record<string, unknown>).chapterMarkdown;
  if (typeof raw !== "string") return null;
  return raw.trim().length > 0 ? raw : null;
}

type ChapterBodySource = "markdown" | "richtext";

/** 显式模式；无标记时若已有 chapterMarkdown 则视为 markdown（兼容旧稿）。 */
function chapterBodySourceFromNode(node: PlotNode | undefined): ChapterBodySource {
  if (!node?.metadata || typeof node.metadata !== "object") return "richtext";
  const meta = node.metadata as Record<string, unknown>;
  const s = meta.chapterBodySource;
  if (s === "markdown") return "markdown";
  if (s === "richtext") return "richtext";
  const md = chapterMarkdownFromNode(node);
  if (md && md.trim().length > 0) return "markdown";
  return "richtext";
}

function renderMarkdownToTipTapHtml(md: string): string {
  const parsed = marked.parse(md, {
    breaks: true,
    gfm: true,
    async: false,
  });
  const htmlRaw = typeof parsed === "string" ? parsed : String(parsed);
  const trimmed = htmlRaw.trim();
  const html = trimmed.length > 0 ? trimmed : "<p></p>";
  return normalizeMarkedHtmlForTipTap(html);
}

/** 与结构元数据一致的 HTML（Markdown 模式以 MD 渲染为准）。 */
function chapterCanonicalBodyHtml(node: PlotNode | undefined): string {
  if (!node) return "";
  if (chapterBodySourceFromNode(node) === "markdown") {
    return renderMarkdownToTipTapHtml(chapterMarkdownFromNode(node) ?? "");
  }
  return chapterHtmlFromNode(node) ?? "";
}

function chapterDisplayHtmlForEditor(node: PlotNode | undefined): string {
  const h = chapterCanonicalBodyHtml(node).trim();
  return h.length > 0 ? h : "<p></p>";
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

/** 富文本模式下保留「上次从弹窗应用」的 MD，便于再次打开弹窗不丢表格；主编辑器落盘会清除。 */
const CHAPTER_MD_EDITOR_DRAFT_KEY = "chapterMarkdownEditorDraft";
const CHAPTER_CONTENT_POST_TIMEOUT_MS = 10_000;
const STRUCTURE_METADATA_BLOCKLIST = new Set([
  "chapterMarkdown",
  "chapterHtml",
  "chapterHtmlDesktop",
  "chapterHtmlMobile",
  CHAPTER_MD_EDITOR_DRAFT_KEY,
  "chapterBodySource",
]);

function chapterMarkdownEditorDraftFromNode(
  node: PlotNode | undefined,
): string | null {
  if (!node?.metadata || typeof node.metadata !== "object") return null;
  const raw = (node.metadata as Record<string, unknown>)[
    CHAPTER_MD_EDITOR_DRAFT_KEY
  ];
  if (typeof raw !== "string") return null;
  return raw.trim().length > 0 ? raw : null;
}

function sanitizeStructureNodeForSync(node: PlotNode): PlotNode {
  if (!node.metadata || typeof node.metadata !== "object") return node;
  const metadata = { ...(node.metadata as Record<string, unknown>) };
  for (const key of STRUCTURE_METADATA_BLOCKLIST) {
    delete metadata[key];
  }
  if (Object.keys(metadata).length === 0) {
    const { metadata: _ignored, ...rest } = node;
    return rest as PlotNode;
  }
  return { ...node, metadata };
}

function sanitizeStructureNodesForSync(nodes: PlotNode[]): PlotNode[] {
  return nodes.map(sanitizeStructureNodeForSync);
}

function chapterContentPayloadFromNode(node: PlotNode): Record<string, unknown> | null {
  const meta = node.metadata;
  if (!meta || typeof meta !== "object") return null;
  const src = meta as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (src.chapterBodySource === "markdown" || src.chapterBodySource === "richtext") {
    out.chapterBodySource = src.chapterBodySource;
  }
  if (typeof src.chapterMarkdown === "string") out.chapterMarkdown = src.chapterMarkdown;
  if (typeof src.chapterHtml === "string") out.chapterHtml = src.chapterHtml;
  if (typeof src.chapterHtmlDesktop === "string") out.chapterHtmlDesktop = src.chapterHtmlDesktop;
  if (typeof src.chapterHtmlMobile === "string") out.chapterHtmlMobile = src.chapterHtmlMobile;
  if (typeof src[CHAPTER_MD_EDITOR_DRAFT_KEY] === "string") {
    out.chapterMarkdownEditorDraft = src[CHAPTER_MD_EDITOR_DRAFT_KEY];
  }
  return Object.keys(out).length > 0 ? out : null;
}

function mergeChapterContentsIntoNodes(
  nodes: PlotNode[],
  chapters: Record<string, Record<string, unknown> | undefined>,
): PlotNode[] {
  return nodes.map((n) => {
    if (n.kind !== "chapter") return n;
    const content = chapters[n.id];
    if (!content || typeof content !== "object") return n;
    const base = { ...(n.metadata ?? {}) } as Record<string, unknown>;
    if (content.chapterBodySource === "markdown" || content.chapterBodySource === "richtext") {
      base.chapterBodySource = content.chapterBodySource;
    }
    if (typeof content.chapterMarkdown === "string") base.chapterMarkdown = content.chapterMarkdown;
    if (typeof content.chapterHtml === "string") base.chapterHtml = content.chapterHtml;
    if (typeof content.chapterHtmlDesktop === "string") {
      base.chapterHtmlDesktop = content.chapterHtmlDesktop;
    }
    if (typeof content.chapterHtmlMobile === "string") {
      base.chapterHtmlMobile = content.chapterHtmlMobile;
    }
    if (typeof content.chapterMarkdownEditorDraft === "string") {
      base[CHAPTER_MD_EDITOR_DRAFT_KEY] = content.chapterMarkdownEditorDraft;
    }
    return { ...n, metadata: base };
  });
}

/** TipTap HTML → Markdown 种子：优先 GFM（含表格），失败再退回纯文本剥离。 */
function markdownSeedFromTipTapHtml(html: string): string {
  const gfm = htmlFragmentToGfmMarkdown(html);
  if (gfm.trim().length > 0) return gfm;
  return htmlToMarkdownSeed(html);
}

/**
 * marked 生成的表格是 thead/tbody + 单元格内直接文本；TipTap TableCell/Header 要求 block+（通常需 p）。
 * 不处理时 setContent 会丢掉整表。此处展平 tr 到 table 下，并把裸内容包进 p。
 */
function normalizeMarkedHtmlForTipTap(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html;
  }
  try {
    const doc = new DOMParser().parseFromString(
      `<div data-tip-tap-md="1">${html}</div>`,
      "text/html",
    );
    const root = doc.querySelector("[data-tip-tap-md]");
    if (!root) return html;

    root.querySelectorAll("table").forEach((table) => {
      const directRows: HTMLTableRowElement[] = [];
      for (const child of Array.from(table.children)) {
        const tag = child.tagName;
        if (tag === "THEAD" || tag === "TBODY" || tag === "TFOOT") {
          for (const tr of Array.from(child.children)) {
            if (tr.tagName === "TR") {
              directRows.push(tr as HTMLTableRowElement);
            }
          }
        } else if (tag === "TR") {
          directRows.push(child as HTMLTableRowElement);
        }
      }
      for (const tr of directRows) {
        table.appendChild(tr);
      }
      table.querySelectorAll("thead, tbody, tfoot").forEach((s) => {
        s.remove();
      });
    });

    const blockTags = new Set([
      "P",
      "DIV",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "UL",
      "OL",
      "BLOCKQUOTE",
      "PRE",
      "TABLE",
    ]);
    root.querySelectorAll("th, td").forEach((cell) => {
      const hasBlock = Array.from(cell.children).some((el) =>
        blockTags.has(el.tagName),
      );
      if (hasBlock) return;
      if (cell.childNodes.length === 0) {
        cell.innerHTML = "<p></p>";
        return;
      }
      cell.innerHTML = `<p>${cell.innerHTML}</p>`;
    });

    return root.innerHTML;
  } catch {
    return html;
  }
}

function escapeInlineScriptPayload(value: string): string {
  return value
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildMarkdownEditorWindowHtml(
  initialMarkdown: string,
  sessionToken: string,
  authorId: string,
  chapterId: string,
): string {
  const escapedMd = escapeInlineScriptPayload(JSON.stringify(initialMarkdown));
  const escapedToken = escapeInlineScriptPayload(JSON.stringify(sessionToken));
  const escapedAuthor = escapeInlineScriptPayload(JSON.stringify(authorId));
  const escapedChapterId = escapeInlineScriptPayload(JSON.stringify(chapterId));
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown 编辑器（支持表格）</title>
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
      .insert-table {
        border-color: rgba(168, 85, 247, 0.45);
        color: #e9d5ff;
      }
      .insert-table:hover {
        border-color: #c084fc;
        color: #f5e1ff;
        background: rgba(168, 85, 247, 0.12);
      }
      .content {
        display: grid;
        width: 100%;
        min-height: 0;
        flex: 1;
        /* minmax(0,1fr) 避免右侧预览里宽表格/长行把 min-content 撑满，挤扁左栏 */
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
      .pane {
        min-width: 0;
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
        max-width: 100%;
        overflow: auto;
        overflow-wrap: break-word;
        word-break: break-word;
        border: 1px solid #26364d;
        border-radius: 8px;
        padding: 12px;
        background: #0b1320;
      }
      .preview pre,
      .preview code {
        white-space: pre-wrap;
        word-break: break-word;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        max-width: 100%;
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
          <button
            id="insert-table-btn"
            class="insert-table"
            type="button"
            title="在光标处插入 Markdown 表格模板（快捷键 Ctrl+Shift+G 或 ⌘+Shift+G）"
          >
            生成表格
          </button>
          <button id="cancel-btn" type="button">取消</button>
          <button id="apply-btn" class="apply" type="button">发布本章节</button>
        </div>
      </header>
      <main class="content">
        <section class="pane">
          <div class="label">Markdown 输入（支持表格：\`| 列1 | 列2 |\`）</div>
          <textarea id="markdown-input" placeholder="在这里输入 Markdown…（可 Ctrl+V 粘贴截图自动上传）"></textarea>
        </section>
        <section class="pane">
          <div class="label">实时预览</div>
          <article id="markdown-preview" class="preview"></article>
        </section>
      </main>
    </div>
    <script>
      window.__MD_SESSION__ = {
        initialMarkdown: ${escapedMd},
        token: ${escapedToken},
        authorId: ${escapedAuthor},
        chapterId: ${escapedChapterId},
      };
      window.__startMarkdownEditor = function () {
        var boot = window.__MD_SESSION__ || {};
        var input = document.getElementById("markdown-input");
        var preview = document.getElementById("markdown-preview");
        var cancelBtn = document.getElementById("cancel-btn");
        var applyBtn = document.getElementById("apply-btn");
        var insertTableBtn = document.getElementById("insert-table-btn");
        if (!input || !preview || !cancelBtn || !applyBtn || !insertTableBtn) {
          return;
        }
        input.value = boot.initialMarkdown || "";

        var buildMarkdownTable = function (cols, dataRows) {
          var c = Math.min(50, Math.max(1, Math.floor(cols)));
          var r = Math.min(100, Math.max(1, Math.floor(dataRows)));
          var rowLine = function () {
            var cells = [];
            for (var i = 0; i < c; i++) cells.push(" ");
            return "| " + cells.join(" | ") + " |";
          };
          var sepLine = function () {
            var cells = [];
            for (var i = 0; i < c; i++) cells.push("---");
            return "| " + cells.join(" | ") + " |";
          };
          var lines = [rowLine(), sepLine()];
          for (var j = 0; j < r; j++) lines.push(rowLine());
          return lines.join("\\n");
        };

        var insertTableAtCursor = function () {
          var colStr = window.prompt("请输入列数（1–50）", "3");
          if (colStr === null) return;
          var rowStr = window.prompt(
            "请输入数据行数（不含表头分隔行，1–100）",
            "3",
          );
          if (rowStr === null) return;
          var cols = parseInt(colStr, 10);
          var dataRows = parseInt(rowStr, 10);
          if (!Number.isFinite(cols) || !Number.isFinite(dataRows)) {
            window.alert("请输入有效数字。");
            return;
          }
          var tableMd = buildMarkdownTable(cols, dataRows);
          var start = input.selectionStart;
          var end = input.selectionEnd;
          var text = input.value;
          var before = text.slice(0, start);
          var after = text.slice(end);
          var padBefore = "";
          if (before.length > 0) {
            padBefore = before.endsWith("\\n\\n")
              ? ""
              : before.endsWith("\\n")
                ? "\\n"
                : "\\n\\n";
          }
          var padAfter = "";
          if (after.length > 0) {
            padAfter = after.startsWith("\\n\\n")
              ? ""
              : after.startsWith("\\n")
                ? "\\n"
                : "\\n\\n";
          }
          var toInsert = padBefore + tableMd + padAfter;
          input.value = before + toInsert + after;
          var caret = start + toInsert.length;
          input.selectionStart = caret;
          input.selectionEnd = caret;
          input.focus();
          void renderPreview();
        };

        insertTableBtn.addEventListener("click", function () {
          insertTableAtCursor();
        });
        input.addEventListener("keydown", function (e) {
          var mod = e.ctrlKey || e.metaKey;
          if (mod && e.shiftKey && (e.key === "g" || e.key === "G")) {
            e.preventDefault();
            insertTableAtCursor();
          }
        });

        input.addEventListener("paste", function (e) {
          var aid = boot.authorId;
          if (!aid || typeof aid !== "string") return;
          var dt = e.clipboardData;
          if (!dt) return;
          var imageFiles = [];
          for (var i = 0; i < dt.items.length; i++) {
            var it = dt.items[i];
            if (it.kind === "file" && it.type.indexOf("image/") === 0) {
              var f = it.getAsFile();
              if (f) imageFiles.push(f);
            }
          }
          if (imageFiles.length === 0) return;
          e.preventDefault();
          var form = new FormData();
          for (var k = 0; k < imageFiles.length; k++) {
            form.append("files", imageFiles[k]);
          }
          fetch("/api/v1/image-host", {
            method: "POST",
            headers: { "x-wallet-address": aid },
            body: form,
          })
            .then(function (r) {
              return r.json().then(function (data) {
                return { r: r, data: data };
              });
            })
            .then(function (ref) {
              var r = ref.r;
              var data = ref.data;
              if (!r.ok || !data.items || !Array.isArray(data.items)) {
                throw new Error((data && data.error) || "图片上传失败");
              }
              var lines = data.items.map(function (item) {
                var name = String((item && item.name) || "image")
                  .split("[")
                  .join("")
                  .split("]")
                  .join("");
                return "![" + name + "](" + String(item.url) + ")";
              });
              var md = lines.join("\\n\\n");
              var start = input.selectionStart;
              var end = input.selectionEnd;
              var text = input.value;
              var before = text.slice(0, start);
              var after = text.slice(end);
              var pb = "";
              if (before.length > 0) {
                pb = before.endsWith("\\n\\n")
                  ? ""
                  : before.endsWith("\\n")
                    ? "\\n"
                    : "\\n\\n";
              }
              var pa = "";
              if (after.length > 0) {
                pa = after.startsWith("\\n\\n")
                  ? ""
                  : after.startsWith("\\n")
                    ? "\\n"
                    : "\\n\\n";
              }
              var ins = pb + md + pa;
              input.value = before + ins + after;
              var caret = start + ins.length;
              input.selectionStart = caret;
              input.selectionEnd = caret;
              input.focus();
              void renderPreview();
            })
            .catch(function (err) {
              window.alert(
                err && err.message ? err.message : "粘贴截图上传失败",
              );
            });
        });

        var renderPreview = async function () {
          var md = input.value || "";
          if (window.marked && typeof window.marked.setOptions === "function") {
            window.marked.setOptions({ breaks: true, gfm: true });
          }
          var parser =
            window.marked && typeof window.marked.parse === "function"
              ? function (txt) {
                  return window.marked.parse(txt);
                }
              : function (txt) {
                  return txt
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/\\n/g, "<br>");
                };
          var maybeRendered = parser(md);
          var rendered =
            maybeRendered && typeof maybeRendered.then === "function"
              ? await maybeRendered
              : maybeRendered;
          preview.innerHTML = typeof rendered === "string" ? rendered : "";
        };

        input.addEventListener("input", function () {
          void renderPreview();
        });
        cancelBtn.addEventListener("click", function () {
          window.close();
        });
        applyBtn.addEventListener("click", function () {
          var targetOrigin = "*";
          try {
            if (window.opener && window.opener.location && window.opener.location.origin) {
              targetOrigin = window.opener.location.origin;
            }
          } catch (e) {}
          if (window.opener) {
            window.opener.postMessage(
              {
                type: "${MARKDOWN_EDITOR_POPUP_MESSAGE_TYPE}",
                token: boot.token,
                chapterId: boot.chapterId,
                markdown: input.value || "",
                renderedHtml: preview.innerHTML || "",
              },
              targetOrigin,
            );
          }
          window.close();
        });

        void renderPreview();
        input.focus();
      };
    </script>
    <script
      src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"
      onload="typeof window.__startMarkdownEditor==='function'&&window.__startMarkdownEditor()"
      onerror="window.alert('Markdown 预览库加载失败，请检查网络或是否拦截了 cdn.jsdelivr.net')"
    ></script>
  </body>
</html>`;
}

/** 富文本模式：以 TipTap HTML 为唯一正文源，不保留 chapterMarkdown。 */
function upsertChapterBodyRichtext(
  nodes: PlotNode[],
  chapterId: string,
  html: string,
  opts?: {
    /** 传入则写入；传 null/"" 则删；不传则删（表示正文已由主编辑器改写，草稿作废） */
    setMarkdownEditorDraft?: string | null;
  },
): PlotNode[] {
  return nodes.map((n) => {
    if (n.id !== chapterId) return n;
    const prev = { ...(n.metadata ?? {}) } as Record<string, unknown>;
    delete prev.chapterMarkdown;
    if (opts && "setMarkdownEditorDraft" in opts) {
      const v = opts.setMarkdownEditorDraft;
      if (v == null || v === "") {
        delete prev[CHAPTER_MD_EDITOR_DRAFT_KEY];
      } else {
        prev[CHAPTER_MD_EDITOR_DRAFT_KEY] = v;
      }
    } else {
      delete prev[CHAPTER_MD_EDITOR_DRAFT_KEY];
    }
    const metadata = {
      ...prev,
      chapterBodySource: "richtext" as const,
      chapterHtml: html,
      chapterHtmlDesktop: html,
      chapterHtmlMobile: html,
    };
    return { ...n, metadata };
  });
}

/**
 * 结构保存入口：markdown 模式始终从已存 MD 重渲染 HTML；富文本模式用当前编辑器 HTML。
 */
function upsertChapterBodyFromTipTapHtml(
  nodes: PlotNode[],
  chapterId: string,
  editorHtml: string,
): PlotNode[] {
  const node = nodes.find((n) => n.id === chapterId);
  if (chapterBodySourceFromNode(node) === "markdown") {
    const md = chapterMarkdownFromNode(node) ?? "";
    const html = renderMarkdownToTipTapHtml(md);
    return upsertChapterMarkdownAndHtml(nodes, chapterId, md, html);
  }
  return upsertChapterBodyRichtext(nodes, chapterId, editorHtml);
}

function upsertChapterMarkdownAndHtml(
  nodes: PlotNode[],
  chapterId: string,
  markdown: string,
  html: string,
): PlotNode[] {
  return nodes.map((n) => {
    if (n.id !== chapterId) return n;
    const base = { ...(n.metadata ?? {}) } as Record<string, unknown>;
    delete base[CHAPTER_MD_EDITOR_DRAFT_KEY];
    const metadata = {
      ...base,
      chapterBodySource: "markdown" as const,
      chapterMarkdown: markdown,
      chapterHtml: html,
      chapterHtmlDesktop: html,
      chapterHtmlMobile: html,
    };
    return { ...n, metadata };
  });
}

function hashText(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16);
}

/** 与发布快照比对用：Markdown 与 HTML 任一变更即视为正文变更 */
const PUBLISHED_CONTENT_FINGERPRINT_KEY = "publishedContentFingerprint";

function chapterBodyFingerprintForCompare(
  node: PlotNode,
  liveHtml?: string | null,
): string {
  const md = chapterMarkdownFromNode(node) ?? "";
  const html =
    liveHtml !== undefined && liveHtml !== null
      ? liveHtml
      : chapterHtmlFromNode(node) ?? "";
  return hashText(`${md}\x1e${html}`);
}

function readPublishedContentFingerprint(node: PlotNode): string | undefined {
  const raw = (node.metadata as Record<string, unknown> | undefined)?.[
    PUBLISHED_CONTENT_FINGERPRINT_KEY
  ];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function patchChapterPublishFingerprintInNodes(
  nodes: PlotNode[],
  chapterId: string,
  publish: boolean,
): PlotNode[] {
  return nodes.map((n) => {
    if (n.id !== chapterId || n.kind !== "chapter") return n;
    const meta = { ...(n.metadata ?? {}) } as Record<string, unknown>;
    if (!publish) {
      delete meta[PUBLISHED_CONTENT_FINGERPRINT_KEY];
      return { ...n, metadata: meta };
    }
    meta[PUBLISHED_CONTENT_FINGERPRINT_KEY] = chapterBodyFingerprintForCompare(n);
    return { ...n, metadata: meta };
  });
}

function patchAllListedChaptersPublishFingerprint(
  nodes: PlotNode[],
  publishedIds: string[],
): PlotNode[] {
  const set = new Set(publishedIds);
  return nodes.map((n) => {
    if (n.kind !== "chapter" || !set.has(n.id)) return n;
    const meta = { ...(n.metadata ?? {}) } as Record<string, unknown>;
    meta[PUBLISHED_CONTENT_FINGERPRINT_KEY] = chapterBodyFingerprintForCompare(n);
    return { ...n, metadata: meta };
  });
}

export function NovelEditorWorkspace({ novelId }: NovelEditorWorkspaceProps) {
  const searchParams = useSearchParams();
  const [manageTab, setManageTab] = useState<ManageTab>("outline");
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const activeChapterIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChapterIdRef.current = activeChapterId;
  }, [activeChapterId]);
  const [resumeStateLoaded, setResumeStateLoaded] = useState(false);
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
  /** 已登录时：仅在大纲 GET 成功并写入 nodes 后（或确认服务端无结构并种子化）为 true，避免占位单章被 POST 覆盖服务端 */
  const [outlineStructureReady, setOutlineStructureReady] = useState(false);
  const outlineStructureReadyRef = useRef(false);
  useEffect(() => {
    outlineStructureReadyRef.current = outlineStructureReady;
  }, [outlineStructureReady]);
  const outlineFetchGenRef = useRef(0);
  const outlineNodesRef = useRef<PlotNode[]>([]);
  useEffect(() => {
    outlineNodesRef.current = outlineNodes;
  }, [outlineNodes]);
  /** 每个作品下「当前章节」已从大纲灌入编辑器一次（切章或 novelId 变化时重置） */
  const lastEditorOutlineHydrationKeyRef = useRef<string>("");

  /** 无 metadata 指纹的旧数据：会话内用首次见到的正文哈希作基线，避免一打开就显示「更新修改」 */
  const publishBaselineSessionRef = useRef<Record<string, string>>({});
  useEffect(() => {
    publishBaselineSessionRef.current = {};
  }, [novelId]);

  useEffect(() => {
    lastEditorOutlineHydrationKeyRef.current = "";
  }, [novelId]);

  const setActiveChapterIdSafe = useCallback((id: string | null) => {
    activeChapterIdRef.current = id;
    setActiveChapterId(id);
  }, []);

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
  const [chapterCastLoading, setChapterCastLoading] = useState(false);
  const [chapterCastRefreshKey, setChapterCastRefreshKey] = useState(0);
  const [personaSidebarMode, setPersonaSidebarMode] =
    useState<PersonaSidebarMode>("works");
  const [firstLineIndentEnabled, setFirstLineIndentEnabled] = useState(false);
  const markdownEditorPopupRef = useRef<Window | null>(null);
  const markdownEditorSessionTokenRef = useRef<string | null>(null);
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
  const [chapterizeMode, setChapterizeMode] = useState<ChapterizeMode>("auto");
  const uploadZipInputRef = useRef<HTMLInputElement | null>(null);
  const uploadImageInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [uploadedImageItems, setUploadedImageItems] = useState<
    Array<{ name: string; url: string }>
  >([]);
  const [translationCompareOpen, setTranslationCompareOpen] = useState(false);
  const [translationSourceMarkdown, setTranslationSourceMarkdown] = useState("");
  const [translationResultMarkdown, setTranslationResultMarkdown] = useState("");
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState("");

  useEffect(() => {
    if (!authorId) draftLoadedKeyRef.current = null;
  }, [authorId]);

  useEffect(() => {
    if (!authorId || !novelId) {
      setResumeStateLoaded(true);
      return;
    }
    setResumeStateLoaded(false);
    const saved = readWorkspaceResumeState(authorId, novelId);
    if (saved?.manageTab && ["personas", "outline", "finance"].includes(saved.manageTab)) {
      setManageTab(saved.manageTab);
    }
    if (typeof saved?.activeChapterId === "string" && saved.activeChapterId.trim()) {
      setActiveChapterIdSafe(saved.activeChapterId.trim());
    }
    setResumeStateLoaded(true);
  }, [authorId, novelId, setActiveChapterIdSafe]);

  useEffect(() => {
    if (!authorId || !novelId || !resumeStateLoaded) return;
    writeWorkspaceResumeState(authorId, novelId, {
      activeChapterId,
      manageTab,
      updatedAt: Date.now(),
    });
  }, [authorId, novelId, activeChapterId, manageTab, resumeStateLoaded]);

  useEffect(() => {
    const pairKey = searchParams.get("translationPairKey");
    if (!pairKey || typeof window === "undefined") return;
    if (!pairKey.startsWith(TRANSLATION_EDITOR_SESSION_PREFIX)) return;
    try {
      const raw = window.sessionStorage.getItem(pairKey);
      if (!raw) return;
      const payload = JSON.parse(raw) as {
        novelId?: unknown;
        sourceText?: unknown;
        translatedText?: unknown;
        targetLanguage?: unknown;
      };
      const targetNovelId =
        typeof payload.novelId === "string" ? payload.novelId : "";
      if (targetNovelId !== novelId) return;
      const sourceText =
        typeof payload.sourceText === "string" ? payload.sourceText : "";
      const translatedText =
        typeof payload.translatedText === "string" ? payload.translatedText : "";
      const targetLang =
        typeof payload.targetLanguage === "string" ? payload.targetLanguage : "";
      setTranslationSourceMarkdown(sourceText);
      setTranslationResultMarkdown(translatedText);
      setTranslationTargetLanguage(targetLang);
      setTranslationCompareOpen(true);
      window.sessionStorage.removeItem(pairKey);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("translationPairKey");
      window.history.replaceState({}, "", nextUrl.toString());
    } catch {
      // ignore parse errors
    }
  }, [novelId, searchParams]);

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

  useEffect(() => {
    setFirstLineIndentEnabled(publishRecord?.firstLineIndent === true);
  }, [publishRecord?.firstLineIndent, novelId]);

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

  const aiReflowWatchSeqRef = useRef(0);

  const watchAiReflowCompletion = useCallback(() => {
    if (!authorId || !novelId) return;
    const seq = (aiReflowWatchSeqRef.current += 1);
    const started = Date.now();
    const maxMs = 20 * 60 * 1000;

    const poll = async () => {
      if (seq !== aiReflowWatchSeqRef.current) return;
      try {
        const r = await fetch(
          `/api/v1/novel-publish?authorId=${encodeURIComponent(authorId)}&novelId=${encodeURIComponent(novelId)}`,
          { headers: { "x-wallet-address": authorId }, cache: "no-store" },
        );
        if (!r.ok) throw new Error("poll failed");
        const data = (await r.json()) as { record?: NovelPublishRecord | null };
        const rec = data.record ?? null;
        if (seq !== aiReflowWatchSeqRef.current) return;

        const st = rec?.aiReflowStatus;
        if (st === "done") {
          window.alert("AI 排版已完成。");
          setPublishRecord(rec);
          return;
        }
        if (st === "error") {
          window.alert(
            `AI 排版失败：${(rec?.aiReflowError && rec.aiReflowError.trim()) || "未知错误"}`,
          );
          setPublishRecord(rec);
          return;
        }
        if (Date.now() - started > maxMs) {
          window.alert("AI 排版等待超时，请稍后刷新页面查看状态。");
          if (rec) setPublishRecord(rec);
          return;
        }
        window.setTimeout(() => void poll(), 2500);
      } catch {
        if (seq !== aiReflowWatchSeqRef.current) return;
        if (Date.now() - started > maxMs) return;
        window.setTimeout(() => void poll(), 4000);
      }
    };
    window.setTimeout(() => void poll(), 800);
  }, [authorId, novelId]);

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
      publishBaselineSessionRef.current = {};
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "撤回失败");
    }
  }, [authorId, novelId]);

  const UPDATE_STRUCTURE_POST_TIMEOUT_MS = 10_000;
  const UPDATE_STRUCTURE_POST_FULL_TIMEOUT_MS = 30_000;
  const SAVE_DRAFT_POST_TIMEOUT_MS = 10_000;
  const PUBLISH_SUBMIT_TIMEOUT_MS = 15_000;

  const postOutlineStructure = useCallback(
    async (
      nodes: PlotNode[],
      options?: {
        mode?: "chapter_patch" | "full";
        chapterId?: string | null;
        /** 为 false 时不弹窗（例如高频/后台场景）；默认 true */
        notifyOnFailure?: boolean;
      },
    ): Promise<boolean> => {
      const notifyOnFailure = options?.notifyOnFailure !== false;
      const aid = authorIdRef.current;
      if (!aid) return true;
      if (!outlineStructureReadyRef.current) return true;
      const mode = options?.mode ?? "chapter_patch";
      const patchChapterId = options?.chapterId ?? activeChapterIdRef.current;
      const chapterNode =
        patchChapterId && mode === "chapter_patch"
          ? nodes.find((n) => n.id === patchChapterId && n.kind === "chapter")
          : undefined;
      const payload =
        mode === "chapter_patch" && chapterNode
          ? {
              authorId: aid,
              docId: novelIdRef.current,
              chapterId: chapterNode.id,
              chapterNode: sanitizeStructureNodeForSync(chapterNode),
            }
          : {
              authorId: aid,
              docId: novelIdRef.current,
              nodes: sanitizeStructureNodesForSync(nodes),
            };
      const requestOnce = async (timeoutMs: number): Promise<Response> => {
        const ac = new AbortController();
        const timeoutId = window.setTimeout(() => ac.abort(), timeoutMs);
        try {
          return await fetch("/api/v1/update-structure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify(payload),
          });
        } finally {
          window.clearTimeout(timeoutId);
        }
      };
      try {
        if (chapterNode && mode === "chapter_patch") {
          await postChapterContent(chapterNode);
        }
        let r: Response;
        try {
          r = await requestOnce(
            mode === "full"
              ? UPDATE_STRUCTURE_POST_FULL_TIMEOUT_MS
              : UPDATE_STRUCTURE_POST_TIMEOUT_MS,
          );
        } catch (e) {
          // 全量保存（新增/删改卷章节）体积可能较大，超时后自动再尝试一次，
          // 减少“操作成功但因客户端超时误判失败”的概率。
          const isAbort = e instanceof DOMException && e.name === "AbortError";
          if (!isAbort || mode !== "full") throw e;
          r = await requestOnce(UPDATE_STRUCTURE_POST_FULL_TIMEOUT_MS);
        }
        if (!r.ok) {
          let detail = `HTTP ${r.status}`;
          try {
            const errBody = (await r.json()) as { error?: unknown };
            if (typeof errBody?.error === "string" && errBody.error.trim()) {
              detail = errBody.error.trim();
            }
          } catch {
            /* 非 JSON 响应 */
          }
          throw new Error(detail);
        }
        return true;
      } catch (e) {
        if (notifyOnFailure) {
          const msg =
            e instanceof DOMException && e.name === "AbortError"
              ? "大纲同步超时，请检查网络后重试。"
              : e instanceof Error
                ? `大纲保存失败：${e.message}`
                : "大纲保存失败，请稍后重试。";
          window.alert(msg);
        }
        return false;
      }
    },
    [],
  );

  const postChapterContent = useCallback(
    async (chapterNode: PlotNode, options?: { keepalive?: boolean }): Promise<void> => {
      const aid = authorIdRef.current;
      if (!aid || chapterNode.kind !== "chapter") return;
      const content = chapterContentPayloadFromNode(chapterNode);
      if (!content) return;
      const ac = new AbortController();
      const timeoutId = window.setTimeout(() => ac.abort(), CHAPTER_CONTENT_POST_TIMEOUT_MS);
      try {
        await fetch("/api/v1/chapter-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: options?.keepalive === true,
          signal: ac.signal,
          body: JSON.stringify({
            authorId: aid,
            docId: novelIdRef.current,
            chapterId: chapterNode.id,
            ...content,
          }),
        });
      } catch {
        /* 正文独立存档失败时静默，避免打断主编辑流 */
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [],
  );

  const snapshotNodesWithActiveChapter = useCallback((): PlotNode[] => {
    const chapterId = activeChapterIdRef.current;
    const ed = editorInstanceRef.current;
    const nodes = outlineNodesRef.current;
    if (!chapterId || !ed || ed.isDestroyed) return nodes;
    return upsertChapterBodyFromTipTapHtml(nodes, chapterId, ed.getHTML());
  }, []);

  const chapterHashById = useCallback((nodes: PlotNode[], chapterId: string): string | null => {
    const node = nodes.find((n) => n.id === chapterId);
    if (!node) return null;
    return hashText(chapterCanonicalBodyHtml(node));
  }, []);

  /**
   * 落盘指定章节：仅当主编辑器当前正在编辑该章节时，才用 TipTap HTML 覆盖结构，
   * 避免 Markdown 弹窗发布期间切换章节后，把错误章节的正文写进目标章。
   */
  const persistChapterForPublish = useCallback(
    async (explicitChapterId?: string | null): Promise<PlotNode[]> => {
      const ed = editorInstanceRef.current;
      const ready = outlineStructureReadyRef.current;
      const chapterId =
        explicitChapterId !== undefined && explicitChapterId !== null
          ? explicitChapterId
          : activeChapterIdRef.current;
      let nodes = outlineNodesRef.current;

      if (!chapterId) {
        if (ready) await postOutlineStructure(nodes);
        return nodes;
      }

      const editorFocusedOnChapter = activeChapterIdRef.current === chapterId;

      if (!ready) {
        if (ed && !ed.isDestroyed && editorFocusedOnChapter) {
          const nextNodes = upsertChapterBodyFromTipTapHtml(
            nodes,
            chapterId,
            ed.getHTML(),
          );
          outlineNodesRef.current = nextNodes;
          setOutlineNodes(nextNodes);
          return nextNodes;
        }
        return nodes;
      }
      if (!ed || ed.isDestroyed || !editorFocusedOnChapter) {
        await postOutlineStructure(nodes);
        return nodes;
      }
      const nextNodes = upsertChapterBodyFromTipTapHtml(
        nodes,
        chapterId,
        ed.getHTML(),
      );
      outlineNodesRef.current = nextNodes;
      setOutlineNodes(nextNodes);
      await postOutlineStructure(nextNodes);
      return nextNodes;
    },
    [postOutlineStructure],
  );

  const persistActiveChapterBeforePublish = useCallback(
    async () => persistChapterForPublish(activeChapterIdRef.current),
    [persistChapterForPublish],
  );

  const prevChapterEditTabRef = useRef<"read" | "edit">("edit");
  useEffect(() => {
    const prev = prevChapterEditTabRef.current;
    prevChapterEditTabRef.current = chapterEditTab;
    // 关键修复：从“编辑”切回“阅读”时，立即落盘当前章节内容，不再依赖切章触发保存。
    if (prev === "edit" && chapterEditTab === "read") {
      void persistActiveChapterBeforePublish();
    }
  }, [chapterEditTab, persistActiveChapterBeforePublish]);

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
      const runPublish = async (alreadyNotifiedAiReflow: boolean) => {
        // Ensure publish uses latest active chapter content persisted on server.
        const latestNodes = await persistActiveChapterBeforePublish();
        const allChapterIds = latestNodes
          .filter((n) => n.kind === "chapter")
          .map((n) => n.id);
        const ac = new AbortController();
        const timeoutId = window.setTimeout(() => ac.abort(), PUBLISH_SUBMIT_TIMEOUT_MS);
        let r: Response;
        try {
          r = await fetch("/api/v1/novel-publish", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": authorId,
            },
            signal: ac.signal,
            body: JSON.stringify({
              authorId,
              novelId,
              allChapterIds,
              firstLineIndent: firstLineIndentEnabled,
              ...payload,
            }),
          });
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            throw new Error("提交超时：请检查网络或稍后重试。");
          }
          throw e;
        } finally {
          window.clearTimeout(timeoutId);
        }

        let data: {
          record?: NovelPublishRecord;
          error?: string;
          aiReflowQueued?: boolean;
        };
        try {
          data = (await r.json()) as typeof data;
        } catch {
          data = {};
        }
        if (!r.ok) throw new Error(data.error ?? "发布失败");
        setPublishRecord(data.record ?? null);
        if (data.aiReflowQueued && !alreadyNotifiedAiReflow) {
          scheduleAiReflowBackgroundNotify(watchAiReflowCompletion);
        }
      };

      const shouldInstantBackgroundNotify =
        payload.visibility === "public" && payload.layoutMode === "ai_reflow";

      if (shouldInstantBackgroundNotify) {
        scheduleAiReflowBackgroundNotify(watchAiReflowCompletion);
        void runPublish(true).catch((e) => {
          window.alert(e instanceof Error ? e.message : "发布失败");
        });
        return;
      }

      await runPublish(false);
    },
    [
      authorId,
      novelId,
      persistActiveChapterBeforePublish,
      watchAiReflowCompletion,
      firstLineIndentEnabled,
    ],
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

  const handleToggleFirstLineIndent = useCallback(
    async (nextChecked: boolean) => {
      setFirstLineIndentEnabled(nextChecked);
      if (!authorId || !publishRecord) return;
      try {
        const r = await fetch("/api/v1/novel-publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": authorId,
          },
          body: JSON.stringify({
            action: "set_reader_style",
            authorId,
            novelId,
            firstLineIndent: nextChecked,
          }),
        });
        const data = (await r.json()) as { record?: NovelPublishRecord; error?: string };
        if (!r.ok) throw new Error(data.error ?? "保存段落样式失败");
        if (data.record) setPublishRecord(data.record);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "保存段落样式失败");
      }
    },
    [authorId, publishRecord, novelId],
  );

  const toggleChapterPublish = useCallback(
    async (
      chapterId: string,
      publish: boolean,
      options?: {
        layoutMode?: PublishLayoutMode;
        /** 为 true 时不把主编辑器 HTML 合并进结构（例如 Markdown 弹窗已写入 nextNodes） */
        trustOutlineOnly?: boolean;
      },
    ) => {
      if (!authorId || !chapterId) return;
      if (displayPublishStatus === "draft") {
        window.alert("请先点击“发布小说”并设为公开后，再按章节发布。");
        return;
      }
      setChapterPublishSubmitting(true);
      try {
        const latestNodes = options?.trustOutlineOnly
          ? outlineNodesRef.current
          : await persistChapterForPublish(chapterId);
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
            layoutMode: options?.layoutMode ?? publishLayoutMode,
          }),
        });
        const data = (await r.json()) as {
          record?: NovelPublishRecord;
          error?: string;
          aiReflowQueued?: boolean;
        };
        if (!r.ok) throw new Error(data.error ?? "章节发布操作失败");
        setPublishRecord(data.record ?? null);
        if (data.aiReflowQueued) {
          scheduleAiReflowBackgroundNotify(watchAiReflowCompletion);
        }
        const patched = patchChapterPublishFingerprintInNodes(
          latestNodes,
          chapterId,
          publish,
        );
        delete publishBaselineSessionRef.current[chapterId];
        outlineNodesRef.current = patched;
        setOutlineNodes(patched);
        void postOutlineStructure(patched, {
          mode: "chapter_patch",
          chapterId,
        });
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "章节发布操作失败");
      } finally {
        setChapterPublishSubmitting(false);
      }
    },
    [
      authorId,
      displayPublishStatus,
      novelId,
      persistChapterForPublish,
      postOutlineStructure,
      publishLayoutMode,
      watchAiReflowCompletion,
    ],
  );

  const toggleCurrentChapterPublish = useCallback(
    async (publish: boolean, options?: { layoutMode?: PublishLayoutMode }) => {
      if (!activeChapterId) return;
      await toggleChapterPublish(activeChapterId, publish, options);
    },
    [activeChapterId, toggleChapterPublish],
  );

  /** 瞬时写入 localStorage，并防抖后同步服务端（与 onUpdate 2000ms 一致）。 */
  const flushWritingContext = useCallback(
    (editor: Editor, forcedChapterId?: string | null) => {
      const aid = authorIdRef.current;
      if (!aid || editor.isDestroyed) return;
      const chapterId = forcedChapterId ?? activeChapterIdRef.current;
      if (!chapterId) return;

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
        chapterId,
        chapterHash: chapterHashById(outlineNodesRef.current, chapterId),
        selection: { from, to },
        selectionJson,
        lastActionTimestamp: now,
        viewportScroll: scrollTop,
        writingSnippet,
        updatedAt: iso,
      };

      const docId = novelIdRef.current;
      writeWritingContextToStorage(aid, docId, payload);

      const ac = new AbortController();
      const timeoutId = window.setTimeout(() => ac.abort(), SAVE_DRAFT_POST_TIMEOUT_MS);
      void fetch("/api/v1/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          mode: "patch_lite",
          authorId: aid,
          docId,
          html: payload.html,
          chapterId: payload.chapterId,
          chapterHash: payload.chapterHash,
          selection: payload.selection,
          selectionJson: payload.selectionJson,
          lastActionTimestamp: payload.lastActionTimestamp,
          viewportScroll: payload.viewportScroll,
          writingSnippet: payload.writingSnippet,
        }),
      })
        .catch(() => {
        /* 静默失败，避免打断写作 */
        })
        .finally(() => {
          window.clearTimeout(timeoutId);
        });
    },
    [],
  );

  const applyRestoredContext = useCallback(
    (editor: Editor, payload: WritingContextPayload, chapterId: string): boolean => {
      if (editor.isDestroyed) return false;
      if (payload.chapterId !== chapterId) {
        return false;
      }
      if (payload.chapterHash) {
        const currentHash = chapterHashById(outlineNodesRef.current, chapterId);
        if (currentHash && currentHash !== payload.chapterHash) {
          return false;
        }
      }
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
      } else {
        return false;
      }
      applySelectionToEditor(editor, payload);
      applyViewportScroll(editorScrollRef.current, payload.viewportScroll);
      return true;
    },
    [chapterHashById],
  );

  useEffect(() => {
    const persistNow = () => {
      const aid = authorIdRef.current;
      const chapterId = activeChapterIdRef.current;
      const ed = editorInstanceRef.current;
      if (!aid || !chapterId || !ed || ed.isDestroyed) return;
      // 本地快照先落，避免突然关闭丢失当前编辑。
      flushWritingContext(ed, chapterId);
      if (!outlineStructureReadyRef.current) return;
      const nextNodes = snapshotNodesWithActiveChapter();
      setOutlineNodes(nextNodes);
      const chapterNode = nextNodes.find(
        (n) => n.id === chapterId && n.kind === "chapter",
      );
      if (!chapterNode) return;
      void postChapterContent(chapterNode, { keepalive: true });
      void fetch("/api/v1/update-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          authorId: aid,
          docId: novelIdRef.current,
          chapterId,
          chapterNode: sanitizeStructureNodeForSync(chapterNode),
        }),
      }).catch(() => {
        /* ignore */
      });
    };

    const onPageHide = () => persistNow();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushWritingContext, postChapterContent, snapshotNodesWithActiveChapter]);

  /** SPA 离开编辑页时尽量落盘；大纲未成功加载时不 POST，避免用占位单章覆盖服务端 */
  useEffect(() => {
    return () => {
      const aid = authorIdRef.current;
      if (!aid || !outlineStructureReadyRef.current) return;
      const chapterId = activeChapterIdRef.current;
      const ed = editorInstanceRef.current;
      if (!chapterId || !ed || ed.isDestroyed) return;
      flushWritingContext(ed, chapterId);
      const nextNodes = upsertChapterBodyFromTipTapHtml(
        outlineNodesRef.current,
        chapterId,
        ed.getHTML(),
      );
      const chapterNode = nextNodes.find(
        (n) => n.id === chapterId && n.kind === "chapter",
      );
      if (!chapterNode) return;
      void postChapterContent(chapterNode, { keepalive: true });
      void fetch("/api/v1/update-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          authorId: aid,
          docId: novelIdRef.current,
          chapterId,
          chapterNode: sanitizeStructureNodeForSync(chapterNode),
        }),
      }).catch(() => {
        /* ignore */
      });
    };
  }, [flushWritingContext, postChapterContent]);

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

  const handleExtractChapterCast = useCallback(async () => {
    if (!authorId || !novelId || !activeChapterId) {
      window.alert("请先连接钱包并在大纲中选中一章。");
      return;
    }
    const chapterNodes = outlineNodes.filter((n) => n.kind === "chapter");
    const idx = chapterNodes.findIndex((n) => n.id === activeChapterId);
    if (idx < 0) {
      window.alert("未找到当前章节。");
      return;
    }
    const chapterIndex = idx + 1;
    const node = chapterNodes[idx]!;
    const bodySource = chapterBodySourceFromNode(node);
    let chapterHtml = "";
    const ed = editorInstanceRef.current;
    const edOk = Boolean(ed && !ed.isDestroyed);
    if (bodySource === "markdown") {
      chapterHtml = chapterCanonicalBodyHtml(node);
    } else if (edOk) {
      chapterHtml = ed!.getHTML();
    } else {
      chapterHtml = chapterHtmlFromNode(node) ?? "";
    }
    if (!chapterHtml.trim()) {
      window.alert("当前章节无正文。");
      return;
    }
    setChapterCastLoading(true);
    try {
      const r = await fetch("/api/v1/chapter-cast/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          authorId,
          novelId,
          chapterId: activeChapterId,
          chapterIndex,
          chapterHtml,
        }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        version?: string;
        files?: string[];
        count?: number;
        error?: string;
        code?: string;
      };
      if (!r.ok) {
        if (r.status === 403 && data.code === "subscription_required") {
          window.alert(data.error ?? "需要付费会员订阅后方可使用此 AI 功能。");
          return;
        }
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      window.alert(
        `已写入 ${data.count ?? 0} 个 JSON（${data.version ?? ""}）`,
      );
      setChapterCastRefreshKey((k) => k + 1);
      setPersonaSidebarMode("chapterCast");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "抽取失败");
    } finally {
      setChapterCastLoading(false);
    }
  }, [authorId, novelId, activeChapterId, outlineNodes]);

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
      setOutlineStructureReady(true);
      return;
    }
    const gen = (outlineFetchGenRef.current += 1);
    setOutlineStructureReady(false);
    const ac = new AbortController();
    const docId = novelId;
    void (async () => {
      try {
        const r = await fetch(
          `/api/v1/update-structure?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(docId)}`,
          { signal: ac.signal },
        );
        if (ac.signal.aborted || outlineFetchGenRef.current !== gen) return;
        if (!r.ok) {
          // 接口异常时仍种子一章并标记就绪，避免编辑器与发布按钮长期不可用
          const fallback = createDefaultChapterOneNodes();
          setOutlineNodes(fallback);
          setOutlineStructureReady(true);
          return;
        }
        const data = (await r.json()) as {
          nodes: PlotNode[] | null;
          updatedAt: string | null;
        };
        if (ac.signal.aborted || outlineFetchGenRef.current !== gen) return;
        if (data.nodes && data.nodes.length > 0) {
          let hydratedNodes = data.nodes;
          try {
            const cr = await fetch(
              `/api/v1/chapter-content?authorId=${encodeURIComponent(authorId)}&docId=${encodeURIComponent(docId)}`,
              { signal: ac.signal },
            );
            if (cr.ok && !ac.signal.aborted) {
              const cdata = (await cr.json()) as {
                chapters?: Record<string, Record<string, unknown> | undefined>;
              };
              const chapterMap =
                cdata?.chapters && typeof cdata.chapters === "object" ? cdata.chapters : {};
              hydratedNodes = mergeChapterContentsIntoNodes(hydratedNodes, chapterMap);
            }
          } catch (e) {
            if (!(e instanceof DOMException && e.name === "AbortError")) {
              /* 正文回填失败不阻塞大纲加载 */
            }
          }
          if (ac.signal.aborted || outlineFetchGenRef.current !== gen) return;
          setOutlineNodes(hydratedNodes);
          setOutlineStructureReady(true);
          return;
        }
        // GET 成功且服务端尚无结构：种子一章（新作品）
        const chapterOne = createDefaultChapterOneNodes();
        setOutlineNodes(chapterOne);
        try {
          await fetch("/api/v1/update-structure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              authorId,
              docId: novelId,
              nodes: sanitizeStructureNodesForSync(chapterOne),
            }),
          });
        } catch {
          /* 与 postOutlineStructure 一致：静默 */
        }
        if (outlineFetchGenRef.current !== gen) return;
        setOutlineStructureReady(true);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (outlineFetchGenRef.current !== gen) return;
        const fallback = createDefaultChapterOneNodes();
        setOutlineNodes(fallback);
        setOutlineStructureReady(true);
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
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
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

  /** 大纲就绪后把当前章 metadata 灌入编辑器，避免占位空文档被当成正文写回错误章节 */
  useEffect(() => {
    if (
      !outlineStructureReady ||
      !editorInstance ||
      editorInstance.isDestroyed ||
      !activeChapterId
    ) {
      return;
    }
    const node = outlineNodes.find(
      (n) => n.id === activeChapterId && n.kind === "chapter",
    );
    if (!node) return;
    const pairKey = `${novelId}|${activeChapterId}`;
    if (lastEditorOutlineHydrationKeyRef.current === pairKey) return;
    lastEditorOutlineHydrationKeyRef.current = pairKey;
    const html = chapterDisplayHtmlForEditor(node);
    editorInstance.commands.setContent(html, { emitUpdate: false });
    setDocTick((t) => t + 1);
  }, [
    outlineStructureReady,
    activeChapterId,
    editorInstance,
    novelId,
    outlineNodes,
  ]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed || !authorId || !activeChapterId) {
      return;
    }

    const docId = novelId;
    const loadKey = `${authorId}:${docId}:${activeChapterId}`;
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
          const restored = applyRestoredContext(editorInstance, local, activeChapterId);
          if (restored) setDocTick((t) => t + 1);
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
          const restored = applyRestoredContext(editorInstance, merged, activeChapterId);
          if (restored) setDocTick((t) => t + 1);
        }

        draftLoadedKeyRef.current = loadKey;

        if (
          merged.chapterId === activeChapterId &&
          shouldShowWakeupBar(merged.lastActionTimestamp)
        ) {
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
  }, [editorInstance, authorId, novelId, activeChapterId, applyRestoredContext]);

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
  const showPersonaInspector =
    manageTab === "personas" && personaSidebarMode === "works";

  useEffect(() => {
    if (manageTab !== "personas") {
      setPersonaSidebarMode("works");
    }
  }, [manageTab]);
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
    if (!resumeStateLoaded) return;
    if (authorId && !outlineStructureReady) return;
    if (chapterNodes.length === 0) {
      setActiveChapterIdSafe(null);
      return;
    }
    const lastChapter = chapterNodes[chapterNodes.length - 1];
    if (!activeChapterId || !chapterNodes.some((c) => c.id === activeChapterId)) {
      setActiveChapterIdSafe(lastChapter.id);
    }
  }, [
    chapterNodes,
    activeChapterId,
    resumeStateLoaded,
    authorId,
    outlineStructureReady,
    setActiveChapterIdSafe,
  ]);

  const persistCurrentChapterContent = useCallback(() => {
    const ed = editorInstance;
    if (!ed || ed.isDestroyed || !activeChapterId) return outlineNodes;
    const currentHtml = ed.getHTML();
    return upsertChapterBodyFromTipTapHtml(outlineNodes, activeChapterId, currentHtml);
  }, [editorInstance, activeChapterId, outlineNodes]);

  const jumpToChapter = useCallback(
    (chapter: PlotNode) => {
      const ed = editorInstance;
      const nextNodes = persistCurrentChapterContent();
      const target = nextNodes.find((n) => n.id === chapter.id);
      const targetHtml = chapterDisplayHtmlForEditor(target);
      setOutlineNodes(nextNodes);
      void postOutlineStructure(nextNodes);
      setActiveChapterIdSafe(chapter.id);
      if (!ed || ed.isDestroyed) return;
      ed.commands.setContent(targetHtml, { emitUpdate: true });
      setDocTick((t) => t + 1);
      flushWritingContext(ed, chapter.id);
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
    async (chapterId: string): Promise<boolean> => {
      const target = chapterNodes.find((c) => c.id === chapterId);
      if (!target) return false;
      if (!window.confirm(`确定删除章节「${target.title || "未命名章节"}」吗？`)) return false;

      const currentNodes = persistCurrentChapterContent();
      const currentChapterNodes = currentNodes.filter((n) => n.kind === "chapter");
      const deleteIndex = currentChapterNodes.findIndex((n) => n.id === chapterId);
      if (deleteIndex < 0) return false;

      const nextNodes = currentNodes.filter((n) => n.id !== chapterId);
      const nextChapterNodes = nextNodes.filter((n) => n.kind === "chapter");
      setOutlineNodes(nextNodes);
      const saved = await postOutlineStructure(nextNodes, { mode: "full" });

      setPublishRecord((prev) => {
        if (!prev?.publishedChapterIds?.includes(chapterId)) return prev;
        return {
          ...prev,
          publishedChapterIds: prev.publishedChapterIds.filter((id) => id !== chapterId),
        };
      });
      delete publishBaselineSessionRef.current[chapterId];

      const ed = editorInstance;
      if (nextChapterNodes.length === 0) {
        setActiveChapterIdSafe(null);
        if (!ed || ed.isDestroyed) return saved;
        ed.commands.setContent("<p></p>", { emitUpdate: true });
        setDocTick((t) => t + 1);
        ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run();
        return saved;
      }

      if (activeChapterId !== chapterId) {
        return saved;
      }

      const fallback =
        nextChapterNodes[Math.min(deleteIndex, nextChapterNodes.length - 1)] ??
        nextChapterNodes[0];
      const fallbackHtml = chapterDisplayHtmlForEditor(fallback);
      setActiveChapterIdSafe(fallback.id);
      if (!ed || ed.isDestroyed) return saved;
      ed.commands.setContent(fallbackHtml, { emitUpdate: true });
      setDocTick((t) => t + 1);
      flushWritingContext(ed, fallback.id);
      ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run();
      return saved;
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
    const { parentId, createVolumeIfMissing } = resolveParentForNewChapter(
      nextNodes,
      activeChapterId ?? null,
    );
    let parentForChapter = parentId;
    if (createVolumeIfMissing) {
      const vId = makePlotNodeId("plot-volume");
      nextNodes.push({
        id: vId,
        kind: "volume",
        title: "",
        summary: "",
      });
      parentForChapter = vId;
    }

    const newChapter: PlotNode = {
      id: makePlotNodeId("plot-chapter"),
      kind: "chapter",
      title,
      summary: "",
      tags: [],
      ...(parentForChapter != null ? { parentId: parentForChapter } : {}),
      metadata: { chapterHtml: "<p></p>" },
    };
    nextNodes.push(newChapter);
    setOutlineNodes(nextNodes);
    void postOutlineStructure(nextNodes, { mode: "full" });
    setActiveChapterIdSafe(newChapter.id);

    const ed = editorInstance;
    if (!ed || ed.isDestroyed) return;
    ed.commands.setContent("<p></p>", { emitUpdate: true });
    setDocTick((t) => t + 1);
    flushWritingContext(ed, newChapter.id);
    ed.chain().focus().setTextSelection({ from: 1, to: 1 }).run();
  }, [
    chapterNodes,
    activeChapterId,
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
  const isCurrentChapterPublished = Boolean(
    activeChapterId && publishedChapterIdSet.has(activeChapterId),
  );
  const chapterPublishDirtySet = useMemo(() => {
    const dirty = new Set<string>();
    const ed = editorInstance;
    const edOk = Boolean(ed && !ed.isDestroyed);
    for (const n of outlineNodes) {
      if (n.kind !== "chapter") continue;
      if (!publishedChapterIdSet.has(n.id)) continue;
      const liveHtml =
        edOk && n.id === activeChapterId ? ed!.getHTML() : null;
      const cur = chapterBodyFingerprintForCompare(n, liveHtml);
      const stored = readPublishedContentFingerprint(n);
      let baseline: string;
      if (stored) {
        baseline = stored;
      } else {
        if (publishBaselineSessionRef.current[n.id] === undefined) {
          publishBaselineSessionRef.current[n.id] = cur;
        }
        baseline = publishBaselineSessionRef.current[n.id];
      }
      if (cur !== baseline) dirty.add(n.id);
    }
    return dirty;
  }, [
    outlineNodes,
    publishedChapterIdSet,
    docTick,
    activeChapterId,
    editorInstance,
  ]);
  const isCurrentChapterPublishDirty = Boolean(
    activeChapterId && chapterPublishDirtySet.has(activeChapterId),
  );
  const isPublishedChapterReadOnly =
    isCurrentChapterPublished && chapterEditTab !== "edit";

  const activeChapterBodySource = useMemo((): ChapterBodySource => {
    const node = outlineNodes.find(
      (n) => n.id === activeChapterId && n.kind === "chapter",
    );
    return chapterBodySourceFromNode(node);
  }, [outlineNodes, activeChapterId]);

  useEffect(() => {
    if (!editorInstance || editorInstance.isDestroyed) return;
    const canEditTipTapBody =
      chapterEditTab === "edit" &&
      !isPublishedChapterReadOnly &&
      activeChapterBodySource !== "markdown";
    editorInstance.setEditable(canEditTipTapBody);
  }, [
    editorInstance,
    chapterEditTab,
    isPublishedChapterReadOnly,
    activeChapterBodySource,
  ]);

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
    async (markdown: string, targetChapterId: string) => {
      const chapterId = targetChapterId.trim();
      if (!authorId || !chapterId) {
        throw new Error("请先选择章节并连接钱包");
      }
      const md = typeof markdown === "string" ? markdown : "";
      const html = renderMarkdownToTipTapHtml(md);
      const baseNodes = outlineNodesRef.current;
      const chapterNode = baseNodes.find((n) => n.id === chapterId);
      if (!chapterNode || chapterNode.kind !== "chapter") {
        throw new Error("未找到对应章节，请刷新页面后重试。");
      }
      const source = chapterBodySourceFromNode(chapterNode);
      const nextNodes =
        source === "richtext"
          ? upsertChapterBodyRichtext(baseNodes, chapterId, html, {
              setMarkdownEditorDraft: md,
            })
          : upsertChapterMarkdownAndHtml(baseNodes, chapterId, md, html);
      // setState 异步：随后 toggle 会立刻调用 persist，必须用 ref 同步，否则会拿旧 outline 覆盖刚写入的 chapterMarkdown。
      outlineNodesRef.current = nextNodes;
      setOutlineNodes(nextNodes);
      if (activeChapterIdRef.current === chapterId) {
        applyRenderedHtmlToEditor(html);
      }
      const structureSaved = await postOutlineStructure(nextNodes, {
        mode: "chapter_patch",
        chapterId,
      });
      if (!structureSaved) return;
      await toggleChapterPublish(chapterId, true, {
        layoutMode: "preserve",
        trustOutlineOnly: true,
      });
    },
    [
      authorId,
      applyRenderedHtmlToEditor,
      postOutlineStructure,
      toggleChapterPublish,
    ],
  );

  const publishCurrentChapterFromMarkdownRef = useRef(
    publishCurrentChapterFromMarkdown,
  );
  publishCurrentChapterFromMarkdownRef.current =
    publishCurrentChapterFromMarkdown;

  const handleChapterBodySourceChange = useCallback(
    (next: ChapterBodySource) => {
      if (!activeChapterId || !editorInstance || editorInstance.isDestroyed) {
        return;
      }
      const chapterNode = outlineNodes.find((n) => n.id === activeChapterId);
      const cur = chapterBodySourceFromNode(chapterNode);
      if (cur === next) return;

      if (next === "markdown") {
        let md = chapterMarkdownFromNode(chapterNode);
        if (!md || !md.trim()) {
          md = markdownSeedFromTipTapHtml(editorInstance.getHTML());
          window.alert(
            "当前章尚无 Markdown 存档，已从当前正文生成初稿（尽量保留表格等结构）；请在 Markdown 中核对。",
          );
        }
        const html = renderMarkdownToTipTapHtml(md);
        const nextNodes = upsertChapterMarkdownAndHtml(
          outlineNodes,
          activeChapterId,
          md,
          html,
        );
        outlineNodesRef.current = nextNodes;
        setOutlineNodes(nextNodes);
        editorInstance.commands.setContent(html, { emitUpdate: false });
        setDocTick((t) => t + 1);
        void postOutlineStructure(nextNodes);
        return;
      }

      if (
        !window.confirm(
          "切换为富文本模式将删除本章保存的 Markdown 源，仅保留当前渲染 HTML。确定？",
        )
      ) {
        return;
      }
      const html = editorInstance.getHTML();
      const nextNodes = upsertChapterBodyRichtext(
        outlineNodes,
        activeChapterId,
        html,
      );
      outlineNodesRef.current = nextNodes;
      setOutlineNodes(nextNodes);
      void postOutlineStructure(nextNodes);
    },
    [activeChapterId, editorInstance, outlineNodes, postOutlineStructure],
  );

  const openMarkdownEditor = useCallback(() => {
    if (!authorId) return;
    if (!activeChapterId) {
      window.alert("请先在大纲中选择要编辑的章节。");
      return;
    }
    if (!editorInstance || editorInstance.isDestroyed) {
      window.alert("编辑器尚未就绪，请稍候再试 Markdown 编辑器。");
      return;
    }
    const chapterNode = outlineNodes.find((n) => n.id === activeChapterId);
    const bodySource = chapterBodySourceFromNode(chapterNode);
    const savedMd = chapterMarkdownFromNode(chapterNode);
    const draftMd = chapterMarkdownEditorDraftFromNode(chapterNode);
    const fromEditor = markdownSeedFromTipTapHtml(editorInstance.getHTML());
    const markdownSeed =
      bodySource === "markdown"
        ? savedMd && savedMd.trim().length > 0
          ? savedMd
          : fromEditor
        : draftMd && draftMd.trim().length > 0
          ? draftMd
          : fromEditor;
    const sessionToken =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `md-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    markdownEditorSessionTokenRef.current = sessionToken;
    const popup = window.open(
      "",
      "_blank",
      "popup=yes,width=1360,height=900,resizable=yes,scrollbars=yes",
    );
    if (!popup) {
      markdownEditorSessionTokenRef.current = null;
      window.alert("浏览器拦截了新窗口，请允许弹窗后重试。");
      return;
    }
    popup.document.open();
    popup.document.write(
      buildMarkdownEditorWindowHtml(
        markdownSeed,
        sessionToken,
        authorId,
        activeChapterId,
      ),
    );
    popup.document.close();
    popup.focus();
    markdownEditorPopupRef.current = popup;
  }, [authorId, editorInstance, outlineNodes, activeChapterId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      const payload = event.data as {
        type?: unknown;
        token?: unknown;
        markdown?: unknown;
        renderedHtml?: unknown;
        chapterId?: unknown;
      };
      if (payload.type !== MARKDOWN_EDITOR_POPUP_MESSAGE_TYPE) return;
      const expected = markdownEditorSessionTokenRef.current;
      if (
        typeof payload.token !== "string" ||
        !expected ||
        payload.token !== expected
      ) {
        return;
      }
      void (async () => {
        try {
          if (typeof payload.markdown !== "string") {
            window.alert("未收到 Markdown 正文，请重试。");
            return;
          }
          if (typeof payload.chapterId !== "string" || !payload.chapterId.trim()) {
            window.alert(
              "未收到章节信息，请关闭弹窗后重新打开 Markdown 编辑器再发布。",
            );
            return;
          }
          await publishCurrentChapterFromMarkdownRef.current(
            payload.markdown,
            payload.chapterId.trim(),
          );
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "发布失败");
        } finally {
          markdownEditorSessionTokenRef.current = null;
        }
      })();
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (markdownEditorPopupRef.current && !markdownEditorPopupRef.current.closed) {
        markdownEditorPopupRef.current.close();
      }
      markdownEditorPopupRef.current = null;
      markdownEditorSessionTokenRef.current = null;
    };
    // 不可依赖 publishCurrentChapterFromMarkdown：其随 outline 等频繁变体会触发 cleanup，
    // 从而误关 Markdown 弹窗并清空 session，表现为「闪退」且未保存内容丢失。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable listener; publish via ref
  }, []);

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
          chapterizeMode === "rule"
            ? "将按本地规则快速切章，此操作会覆盖当前章节结构和稿面内容。是否继续？"
            : "将按规则自动切章（中英文章节标题正则识别），此操作会覆盖当前章节结构和稿面内容。是否继续？",
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
            const {
              chapters: mergedChapters,
              batchCount,
              anyTruncated,
            } = await chapterizeTxtViaApi(text, chapterizeMode, {
              walletAddress: authorId,
            });

            const volumeId = makePlotNodeId("plot-volume");
            const nextNodes: PlotNode[] = [
              {
                id: volumeId,
                kind: "volume",
                title: "",
                summary: "",
              },
              ...mergedChapters.map((ch, idx) => ({
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
            void postOutlineStructure(nextNodes, { mode: "full" });
            const latestChapterIds = nextNodes
              .filter((n) => n.kind === "chapter")
              .map((n) => n.id);

            // 根治：重切章会重建 chapterId，需同步发布记录里的 publishedChapterIds，
            // 否则读者端按旧 ID 过滤时可能出现整篇空白。
            if (latestChapterIds.length > 0 && publishRecord?.visibility === "public") {
              try {
                const syncResp = await fetch("/api/v1/novel-publish", {
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
                const syncData = (await syncResp.json()) as {
                  record?: NovelPublishRecord;
                  error?: string;
                  aiReflowQueued?: boolean;
                };
                if (syncResp.ok && syncData.record) {
                  setPublishRecord(syncData.record);
                  if (syncData.aiReflowQueued) {
                    scheduleAiReflowBackgroundNotify(watchAiReflowCompletion);
                  }
                } else {
                  window.alert(syncData.error ?? "章节重建后同步发布状态失败，请手动点击“一键发布全部章节”。");
                }
              } catch {
                window.alert("章节重建后同步发布状态失败，请手动点击“一键发布全部章节”。");
              }
            }

            const firstChapter = nextNodes.find((n) => n.kind === "chapter");
            const firstHtml = firstChapter
              ? chapterDisplayHtmlForEditor(firstChapter)
              : "<p></p>";
            if (firstChapter) setActiveChapterIdSafe(firstChapter.id);
            editorInstance.commands.setContent(firstHtml, { emitUpdate: true });
            setDocTick((t) => t + 1);
            flushWritingContext(editorInstance, firstChapter?.id ?? null);

            window.alert(
              `已按规则完成全量切章（共 ${mergedChapters.length} 章，分 ${batchCount} 批处理）。`,
            );
            if (anyTruncated) {
              window.alert("切章结果已触发章节数量上限（2000），仅保留前 2000 章。");
            }
          } catch (err) {
            window.alert(err instanceof Error ? err.message : "切章失败");
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
    [
      authorId,
      chapterizeMode,
      editorInstance,
      flushWritingContext,
      novelId,
      postOutlineStructure,
      publishLayoutMode,
      publishRecord?.visibility,
      watchAiReflowCompletion,
    ],
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
          novelId={novelId}
          authorId={authorId}
          activeChapterId={activeChapterId}
          sidebarMode={personaSidebarMode}
          onSidebarModeChange={setPersonaSidebarMode}
          chapterCastRefreshKey={chapterCastRefreshKey}
          onChapterCastExtract={handleExtractChapterCast}
          chapterCastExtracting={chapterCastLoading}
          chapterCastExtractDisabled={
            !authorId || !activeChapterId || chapterCastLoading
          }
        />
      ) : (
        <OutlineSidebar
          nodes={outlineNodes}
          onNodesChange={setOutlineNodes}
          onUpdateStructure={(nodes) => postOutlineStructure(nodes, { mode: "full" })}
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
          publishedChapterDirtyIds={chapterPublishDirtySet}
          chapterPublishDisabled={false}
          onToggleChapterPublish={(chapterId, publish) => {
            if (chapterPublishSubmitting) return;
            void toggleChapterPublish(chapterId, publish);
          }}
          onPublishAllChapters={() => {
            if (chapterPublishSubmitting) return;
            return (async () => {
              if (!authorId) return;
              if (displayPublishStatus === "draft") {
                window.alert(
                  "请先在顶部「发布小说」中将作品设为「公开」并保存后，再使用一键发布全部章节。",
                );
                return;
              }
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
                  aiReflowQueued?: boolean;
                };
                if (!r.ok) throw new Error(data.error ?? "一键发布全部章节失败");
                const record = data.record ?? null;
                setPublishRecord(record);
                if (data.aiReflowQueued) {
                  scheduleAiReflowBackgroundNotify(watchAiReflowCompletion);
                } else {
                  window.alert("已发布全部章节");
                }
                const publishedIds =
                  record?.publishedChapterIds?.length &&
                  record.publishedChapterIds.length > 0
                    ? record.publishedChapterIds
                    : latestChapterIds;
                const patched = patchAllListedChaptersPublishFingerprint(
                  latestNodes,
                  publishedIds,
                );
                publishBaselineSessionRef.current = {};
                setOutlineNodes(patched);
                void postOutlineStructure(patched, { mode: "full" });
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "一键发布全部章节失败");
              } finally {
                setChapterPublishSubmitting(false);
              }
            })();
          }}
          publishAllChaptersDisabled={
            chapterPublishSubmitting || chapterNodes.length === 0
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
                  ? chapterizeMode === "rule"
                    ? "按本地规则快速切章（稳定、低延迟）"
                    : "按规则自动切章（支持中文/英文章节标题）"
                  : ""
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {aiChapterizing ? "切章中…" : "正则切章导入"}
            </button>
            <label className="inline-flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300">
              <span>切章模式</span>
              <select
                value={chapterizeMode}
                onChange={(e) => setChapterizeMode(e.target.value as ChapterizeMode)}
                disabled={!authorId || aiChapterizing || isPublishedChapterReadOnly}
                className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                title="选择切章策略"
              >
                <option value="auto">自动（规则推荐）</option>
                <option value="rule">快速切章（规则）</option>
              </select>
            </label>
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
            <label
              className={[
                "inline-flex cursor-pointer items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300",
                !authorId ||
                !activeChapterId ||
                !editorInstance ||
                editorInstance.isDestroyed ||
                isPublishedChapterReadOnly ||
                !outlineStructureReady
                  ? "cursor-not-allowed opacity-50"
                  : "",
              ].join(" ")}
              title={
                !authorId
                  ? "请先连接钱包"
                  : !outlineStructureReady
                    ? "大纲加载中，请稍候"
                    : !activeChapterId
                      ? "请先在左侧大纲选中一章，再切换正文模式"
                      : !editorInstance || editorInstance.isDestroyed
                        ? "编辑器尚未就绪"
                        : isPublishedChapterReadOnly
                          ? "当前章节已发布且为只读，请切换到「编辑」后再改"
                          : "勾选：本章以 Markdown 为唯一正文源（主编辑器只读，用「Markdown 编辑器」修改）。取消勾选：切回富文本并删除已存 Markdown 源。"
              }
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 rounded border-neutral-400 text-cyan-600 focus:ring-cyan-500 disabled:cursor-not-allowed"
                checked={activeChapterBodySource === "markdown"}
                onChange={(e) =>
                  handleChapterBodySourceChange(
                    e.target.checked ? "markdown" : "richtext",
                  )
                }
                disabled={
                  !authorId ||
                  !activeChapterId ||
                  !editorInstance ||
                  editorInstance.isDestroyed ||
                  isPublishedChapterReadOnly ||
                  !outlineStructureReady
                }
              />
              <span className="max-w-[220px] leading-snug">
                本章使用 <span className="font-medium text-fuchsia-400/95">Markdown 源</span>
                <span className="text-neutral-500 dark:text-neutral-500">
                  （主编辑器只读）
                </span>
              </span>
            </label>
            <button
              type="button"
              disabled={!authorId || isPublishedChapterReadOnly}
              onClick={openMarkdownEditor}
              title={
                !authorId
                  ? "请先连接钱包"
                  : isPublishedChapterReadOnly
                    ? "当前章节已发布且为只读，请切换到“编辑”后再使用 Markdown 编辑器"
                    : activeChapterBodySource === "markdown"
                      ? "编辑本章 Markdown 源（支持表格）"
                      : "用 Markdown 一次性导入并覆盖本章（不保留 Markdown 源）"
              }
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {activeChapterBodySource === "markdown"
                ? "Markdown 编辑器"
                : "Markdown 导入"}
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
              disabled={!authorId}
              onClick={() => setPublishModalOpen(true)}
              title={
                !authorId
                  ? "请先连接钱包"
                  : hasPublishSave
                    ? "查看或修改发布设置"
                    : publishContentReady
                      ? "打开发布配置（公开作品、付费选项与排版策略）"
                      : "打开发布配置。建议正文不少于约 80 字、大纲有章节标题后再公开上架。"
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
              {chapterEditTab === "edit" ? (
                <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={firstLineIndentEnabled}
                    onChange={(e) => void handleToggleFirstLineIndent(e.target.checked)}
                    className="accent-cyan-600"
                  />
                  首行缩进
                </label>
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
              chapterEditTab === "edit" && firstLineIndentEnabled ? "[&_p]:indent-[2em]" : "",
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
                  !isCurrentChapterPublished
                    ? "ml-2 rounded bg-amber-600/20 px-1.5 py-0.5 text-amber-500"
                    : isCurrentChapterPublishDirty
                      ? "ml-2 rounded bg-orange-600/20 px-1.5 py-0.5 text-orange-400"
                      : "ml-2 rounded bg-emerald-600/20 px-1.5 py-0.5 text-emerald-500"
                }
              >
                {!isCurrentChapterPublished
                  ? "未发布"
                  : isCurrentChapterPublishDirty
                    ? "更新修改"
                    : "已发布"}
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
      {translationCompareOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTranslationCompareOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="翻译 Markdown 对照编辑器"
            className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#2a3a54] bg-[#0b1320] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1e2a3f] px-4 py-2">
              <div>
                <h3 className="text-sm font-semibold text-cyan-300">
                  翻译 Markdown 对照编辑器
                </h3>
                <p className="text-[11px] text-zinc-500">
                  左侧原文，右侧译文。可直接修改译文并应用到当前章节。
                  {translationTargetLanguage
                    ? ` 目标语言：${translationTargetLanguage.toUpperCase()}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(translationResultMarkdown);
                    window.alert(ok ? "译文已复制" : "复制失败，请手动复制");
                  }}
                  className="rounded-md border border-neutral-500/50 px-3 py-1 text-xs text-zinc-200 hover:bg-neutral-700/30"
                >
                  复制译文
                </button>
                <button
                  type="button"
                  disabled={
                    !authorId || !activeChapterId || isPublishedChapterReadOnly
                  }
                  onClick={() => {
                    if (!activeChapterId) {
                      window.alert("请先选择要写入的章节。");
                      return;
                    }
                    void publishCurrentChapterFromMarkdown(
                      translationResultMarkdown,
                      activeChapterId,
                    )
                      .then(() => {
                        window.alert("译文已应用到当前章节");
                        setTranslationCompareOpen(false);
                      })
                      .catch((e) => {
                        window.alert(e instanceof Error ? e.message : "应用失败");
                      });
                  }}
                  className="rounded-md border border-emerald-400/60 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  应用译文到当前章节
                </button>
                <button
                  type="button"
                  onClick={() => setTranslationCompareOpen(false)}
                  className="rounded-md border border-neutral-500/50 px-3 py-1 text-xs text-zinc-200 hover:bg-neutral-700/30"
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
              <div className="border-r border-[#1e2a3f] p-3">
                <p className="mb-2 text-xs font-medium text-zinc-300">原文（Markdown）</p>
                <textarea
                  value={translationSourceMarkdown}
                  onChange={(e) => setTranslationSourceMarkdown(e.target.value)}
                  className="h-full min-h-[320px] w-full resize-none rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                />
              </div>
              <div className="p-3">
                <p className="mb-2 text-xs font-medium text-zinc-300">译文（Markdown）</p>
                <textarea
                  value={translationResultMarkdown}
                  onChange={(e) => setTranslationResultMarkdown(e.target.value)}
                  className="h-full min-h-[320px] w-full resize-none rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
