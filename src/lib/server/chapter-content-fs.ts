import fs from "node:fs/promises";
import path from "node:path";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";

/** 与 `app/api/v1/chapter-content/route.ts` 落盘 JSON 形状一致 */
export type ChapterContentDiskPayload = {
  chapterId: string;
  chapterBodySource?: "markdown" | "richtext";
  chapterMarkdown?: string;
  chapterHtml?: string;
  chapterHtmlDesktop?: string;
  chapterHtmlMobile?: string;
  chapterMarkdownEditorDraft?: string;
  updatedAt: string;
};

const DEFAULT_DOC_ID = "default";

export function safeChapterContentSegment(input: string, maxLen: number): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, maxLen);
}

export function chapterContentFilePath(
  cwd: string,
  authorLower: string,
  docId: string,
  chapterId: string,
): string {
  const safeDoc = safeChapterContentSegment(docId || DEFAULT_DOC_ID, 120);
  const dir = path.join(cwd, ".data", "chapter-content", `${authorLower.toLowerCase()}_${safeDoc}`);
  const safeCh = safeChapterContentSegment(chapterId, 120);
  return path.join(dir, `${safeCh}.json`);
}

/**
 * 读取单章侧车 JSON（`.data/chapter-content/...`）。不存在则返回 null。
 * 与主编台「大纲保存会剥离 metadata 正文、正文在 chapter-content」的模型一致。
 */
export async function readChapterContentPayloadFromDisk(params: {
  cwd?: string;
  authorLower: string;
  novelId: string;
  chapterId: string;
}): Promise<ChapterContentDiskPayload | null> {
  const cwd = params.cwd ?? process.cwd();
  const fp = chapterContentFilePath(cwd, params.authorLower, params.novelId, params.chapterId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = parseLeadingJsonValue(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ChapterContentDiskPayload;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

/**
 * 将单章正文写入 `.data/chapter-content/...`（与 POST /api/v1/chapter-content 一致）。
 * 供 AI 排版 worker、其它服务端逻辑复用，避免读者仍读旧 chapter-content。
 */
export async function writeChapterContentDisk(params: {
  cwd?: string;
  authorLower: string;
  novelId: string;
  chapterId: string;
  payload: Omit<ChapterContentDiskPayload, "chapterId" | "updatedAt"> & { updatedAt?: string };
}): Promise<string> {
  const cwd = params.cwd ?? process.cwd();
  const fp = chapterContentFilePath(cwd, params.authorLower, params.novelId, params.chapterId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  const updatedAt = params.payload.updatedAt ?? new Date().toISOString();
  const full: ChapterContentDiskPayload = {
    chapterId: params.chapterId,
    ...params.payload,
    updatedAt,
  };
  await fs.writeFile(fp, JSON.stringify(full), "utf8");
  return updatedAt;
}
