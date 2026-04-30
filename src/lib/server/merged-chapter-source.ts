import fs from "node:fs/promises";
import path from "node:path";

import { marked } from "marked";

import { contentPayloadToChapterHtmlForExtract } from "@/lib/chapter-content-html-for-extract";
import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import {
  readChapterContentPayloadFromDisk,
  safeChapterContentSegment,
  type ChapterContentDiskPayload,
} from "@/lib/server/chapter-content-fs";

function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseIsoTimeMs(iso: string | undefined): number {
  if (!iso || typeof iso !== "string") return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

type StructureChapterNode = {
  id?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
};

type StructureLite = {
  nodes?: StructureChapterNode[];
  updatedAt?: string;
};

/** 与 `library/articles` 中单章 HTML/Markdown 择优逻辑一致（含 structure vs disk 按 updatedAt）。 */
export function mergeChapterHtmlAndMarkdown(params: {
  metadata: Record<string, unknown> | undefined;
  disk: ChapterContentDiskPayload | null;
  structureUpdatedMs: number;
  preferMobile: boolean;
}): { chapterHtml: string; chapterMarkdown: string | undefined } {
  const storedContent = params.disk;
  const storedUpdatedMs = parseIsoTimeMs(storedContent?.updatedAt);
  const meta = params.metadata ?? {};
  const preferMobile = params.preferMobile;

  const metaMobile =
    typeof meta.chapterHtmlMobile === "string" ? meta.chapterHtmlMobile.trim() : "";
  const metaDesktop =
    typeof meta.chapterHtmlDesktop === "string" ? meta.chapterHtmlDesktop.trim() : "";
  const metaPlain =
    typeof meta.chapterHtml === "string" ? meta.chapterHtml.trim() : "";
  const pickMeta = preferMobile ? metaMobile || metaPlain : metaDesktop || metaPlain;

  const storedPick = preferMobile
    ? storedContent?.chapterHtmlMobile ?? storedContent?.chapterHtml
    : storedContent?.chapterHtmlDesktop ?? storedContent?.chapterHtml;
  const pickStored = typeof storedPick === "string" ? storedPick.trim() : "";

  let chapterHtml: string;
  if (pickMeta && pickStored && pickMeta !== pickStored) {
    chapterHtml =
      params.structureUpdatedMs >= storedUpdatedMs ? pickMeta : pickStored;
  } else if (pickMeta) {
    chapterHtml = pickMeta;
  } else if (pickStored) {
    chapterHtml = pickStored;
  } else {
    chapterHtml = "<p></p>";
  }

  const mdMeta =
    typeof meta.chapterMarkdown === "string" ? meta.chapterMarkdown.trim() : "";
  const mdStored =
    typeof storedContent?.chapterMarkdown === "string"
      ? storedContent.chapterMarkdown.trim()
      : "";

  let chapterMarkdown: string | undefined;
  if (mdMeta && mdStored && mdMeta !== mdStored) {
    chapterMarkdown =
      params.structureUpdatedMs >= storedUpdatedMs ? mdMeta : mdStored;
  } else if (mdMeta) {
    chapterMarkdown = mdMeta;
  } else if (mdStored) {
    chapterMarkdown = mdStored;
  } else {
    chapterMarkdown = undefined;
  }

  return { chapterHtml, chapterMarkdown };
}

export function mergedChapterBodiesToPlainText(opts: {
  chapterHtml: string;
  chapterMarkdown: string | undefined;
  diskFallback: ChapterContentDiskPayload | null;
}): string {
  const { chapterHtml, chapterMarkdown, diskFallback } = opts;

  if (chapterMarkdown?.trim()) {
    const htmlRaw = marked.parse(chapterMarkdown, {
      breaks: true,
      gfm: true,
      async: false,
    });
    const html = typeof htmlRaw === "string" ? htmlRaw : String(htmlRaw);
    const pt = htmlToPlainText(html);
    if (pt.trim()) return pt;
  }

  const trimmedHtml = chapterHtml?.trim();
  if (trimmedHtml && trimmedHtml !== "<p></p>") {
    const pt = htmlToPlainText(chapterHtml);
    if (pt.trim()) return pt;
  }

  if (diskFallback) {
    const fh = contentPayloadToChapterHtmlForExtract(diskFallback);
    if (fh.trim()) return htmlToPlainText(fh);
  }

  return "";
}

function structureFilePath(params: {
  cwd: string;
  authorLower: string;
  novelId: string;
}) {
  const safeDoc = safeChapterContentSegment(params.novelId, 64);
  return path.join(
    params.cwd,
    ".data",
    "structure",
    `${params.authorLower.toLowerCase()}_${safeDoc}.json`,
  );
}

/**
 * 与读者端正文来源一致：`structure` metadata 与 `.data/chapter-content` 按 `updatedAt` 合并，
 * desktop 优先（对齐主编台面）。不存在章节节点时返回空串。
 */
export async function readMergedChapterSourcePlainText(params: {
  cwd?: string;
  authorLower: string;
  novelId: string;
  chapterId: string;
  preferMobile?: boolean;
}): Promise<string> {
  const cwd = params.cwd ?? process.cwd();
  const preferMobile = params.preferMobile ?? false;
  let structure: StructureLite;
  try {
    const raw = await fs.readFile(
      structureFilePath({
        cwd,
        authorLower: params.authorLower,
        novelId: params.novelId,
      }),
      "utf8",
    );
    structure = parseLeadingJsonValue(raw) as StructureLite;
  } catch {
    return "";
  }

  const chapter = (structure.nodes ?? []).find(
    (n) => n.kind === "chapter" && n.id === params.chapterId,
  );
  if (!chapter) return "";

  const disk = await readChapterContentPayloadFromDisk({
    cwd,
    authorLower: params.authorLower,
    novelId: params.novelId,
    chapterId: params.chapterId,
  });

  const structureUpdatedMs = parseIsoTimeMs(structure.updatedAt);
  const { chapterHtml, chapterMarkdown } = mergeChapterHtmlAndMarkdown({
    metadata: chapter.metadata,
    disk,
    structureUpdatedMs,
    preferMobile,
  });

  return mergedChapterBodiesToPlainText({
    chapterHtml,
    chapterMarkdown,
    diskFallback: disk,
  });
}

export async function readAllMergedChaptersPlainText(params: {
  cwd?: string;
  authorLower: string;
  novelId: string;
  preferMobile?: boolean;
}): Promise<string> {
  const cwd = params.cwd ?? process.cwd();
  const preferMobile = params.preferMobile ?? false;
  let structure: StructureLite;
  try {
    const raw = await fs.readFile(
      structureFilePath({
        cwd,
        authorLower: params.authorLower,
        novelId: params.novelId,
      }),
      "utf8",
    );
    structure = parseLeadingJsonValue(raw) as StructureLite;
  } catch {
    return "";
  }

  const structureUpdatedMs = parseIsoTimeMs(structure.updatedAt);
  const chapterNodes = (structure.nodes ?? []).filter((n) => n.kind === "chapter");
  const parts: string[] = [];

  for (const ch of chapterNodes) {
    if (typeof ch.id !== "string" || !ch.id) continue;
    const disk = await readChapterContentPayloadFromDisk({
      cwd,
      authorLower: params.authorLower,
      novelId: params.novelId,
      chapterId: ch.id,
    });
    const { chapterHtml, chapterMarkdown } = mergeChapterHtmlAndMarkdown({
      metadata: ch.metadata,
      disk,
      structureUpdatedMs,
      preferMobile,
    });
    const txt = mergedChapterBodiesToPlainText({
      chapterHtml,
      chapterMarkdown,
      diskFallback: disk,
    }).trim();
    if (txt) parts.push(txt);
  }

  return parts.join("\n\n").trim();
}
