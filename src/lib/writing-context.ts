import type { Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

/** 写作上下文：与 save-draft / localStorage 对齐的可序列化快照。 */

export type SelectionJson = Record<string, unknown>;

export type WritingContextPayload = {
  html: string | null;
  json: unknown | null;
  selection: { from: number; to: number } | null;
  selectionJson: SelectionJson | null;
  lastActionTimestamp: number;
  viewportScroll: number;
  writingSnippet: string;
  /** 服务端 ISO 时间，用于与旧存档比较 */
  updatedAt?: string | null;
};

const STORAGE_PREFIX = "chenchen-writing-context:";

export function writingContextStorageKey(authorId: string, docId: string) {
  return `${STORAGE_PREFIX}${authorId.toLowerCase()}:${docId}`;
}

export function readWritingContextFromStorage(
  authorId: string,
  docId: string,
): WritingContextPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      writingContextStorageKey(authorId, docId),
    );
    if (!raw) return null;
    const o = JSON.parse(raw) as WritingContextPayload;
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

export function writeWritingContextToStorage(
  authorId: string,
  docId: string,
  payload: WritingContextPayload,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      writingContextStorageKey(authorId, docId),
      JSON.stringify(payload),
    );
  } catch {
    /* quota / private mode */
  }
}

function remoteToPayload(data: Record<string, unknown>): WritingContextPayload {
  const sel = data.selection;
  let selection: { from: number; to: number } | null = null;
  if (sel && typeof sel === "object" && "from" in sel) {
    const s = sel as Record<string, unknown>;
    const from = Number(s.from);
    const to = Number(s.to ?? s.from);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      selection = { from, to };
    }
  }

  const selectionJson =
    data.selectionJson && typeof data.selectionJson === "object"
      ? (data.selectionJson as SelectionJson)
      : null;

  const rawTs = data.lastActionTimestamp;
  let lastActionTimestamp = 0;
  if (typeof rawTs === "number" && Number.isFinite(rawTs)) {
    lastActionTimestamp = rawTs;
  } else if (data.updatedAt) {
    const p = Date.parse(String(data.updatedAt));
    if (Number.isFinite(p)) lastActionTimestamp = p;
  }

  const vScroll = Number(data.viewportScroll);
  const viewportScroll = Number.isFinite(vScroll) ? vScroll : 0;
  const writingSnippet =
    typeof data.writingSnippet === "string" ? data.writingSnippet : "";

  return {
    html: typeof data.html === "string" ? data.html : null,
    json: data.json ?? null,
    selection,
    selectionJson,
    lastActionTimestamp,
    viewportScroll,
    writingSnippet,
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : data.updatedAt === null
          ? null
          : undefined,
  };
}

export function pickNewerWritingContext(
  local: WritingContextPayload | null,
  remoteRaw: Record<string, unknown> | null,
): WritingContextPayload | null {
  const hasRemoteContent =
    remoteRaw &&
    ((remoteRaw.json !== null &&
      typeof remoteRaw.json === "object" &&
      Object.keys(remoteRaw.json as object).length > 0) ||
      (typeof remoteRaw.html === "string" && remoteRaw.html.trim().length > 0));

  const hasLocalContent =
    local &&
    ((local.json !== null &&
      typeof local.json === "object" &&
      Object.keys(local.json as object).length > 0) ||
      (typeof local.html === "string" && local.html.trim().length > 0));

  if (!hasLocalContent && !hasRemoteContent) return null;

  if (!hasLocalContent && hasRemoteContent) {
    return remoteToPayload(remoteRaw!);
  }
  if (hasLocalContent && !hasRemoteContent) {
    return local!;
  }

  const remote = remoteToPayload(remoteRaw!);
  const localTs = local!.lastActionTimestamp;
  const remoteTs =
    remote.lastActionTimestamp ||
    (remote.updatedAt ? Date.parse(remote.updatedAt) : 0) ||
    0;

  return remoteTs >= localTs ? remote : local!;
}

export function formatAuthorLabel(authorId: string): string {
  if (authorId.length <= 12) return authorId;
  return `${authorId.slice(0, 6)}…${authorId.slice(-4)}`;
}

const HOUR_MS = 60 * 60 * 1000;

export function shouldShowWakeupBar(lastActionTimestamp: number): boolean {
  if (!lastActionTimestamp || !Number.isFinite(lastActionTimestamp)) {
    return false;
  }
  return Date.now() - lastActionTimestamp > HOUR_MS;
}

export function hasWritingPayload(p: WritingContextPayload | null): boolean {
  if (!p) return false;
  const hasJson =
    p.json !== null &&
    typeof p.json === "object" &&
    Object.keys(p.json as object).length > 0;
  const hasHtml = typeof p.html === "string" && p.html.trim().length > 0;
  return hasJson || hasHtml;
}

/** 用 ProseMirror JSON 优先恢复选区，失败则退回 from/to。 */
export function applySelectionToEditor(
  editor: Editor,
  payload: Pick<WritingContextPayload, "selectionJson" | "selection">,
) {
  try {
    if (payload.selectionJson && typeof payload.selectionJson === "object") {
      const sel = Selection.fromJSON(editor.state.doc, payload.selectionJson as never);
      editor.view.dispatch(editor.state.tr.setSelection(sel));
      return;
    }
  } catch {
    /* fallback */
  }
  const sel = payload.selection;
  if (sel && typeof sel.from === "number") {
    const docSize = editor.state.doc.content.size;
    const from = Math.min(Math.max(0, sel.from), docSize);
    const to = Math.min(Math.max(0, sel.to ?? sel.from), docSize);
    editor.commands.setTextSelection({ from, to });
  }
}

export function applyViewportScroll(el: HTMLElement | null, y: number) {
  if (!el || !Number.isFinite(y)) return;
  requestAnimationFrame(() => {
    el.scrollTop = Math.max(0, y);
  });
}

/** 从光标所在块截取预览（多英文则取前 5 词；否则取约十字） */
export function computeWritingSnippet(editor: Editor): string {
  try {
    const { $anchor } = editor.state.selection;
    const depth = $anchor.depth;
    const start = $anchor.start(depth);
    const end = $anchor.end(depth);
    const text = editor.state.doc.textBetween(start, end, " ", " ");
    const trimmed = text.trim();
    if (!trimmed) return "……";

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const head = parts.slice(0, 5).join(" ");
      return `${head}…`;
    }

    const maxChars = 10;
    if (trimmed.length > maxChars) return `${trimmed.slice(0, maxChars)}…`;
    return `${trimmed}…`;
  } catch {
    return "……";
  }
}
