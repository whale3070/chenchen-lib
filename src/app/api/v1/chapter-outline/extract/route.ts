import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { CHAPTER_OUTLINE_MAX_CHARS } from "@/lib/chapter-outline";
import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { isAdminWallet, isPaidMemberActive } from "@/lib/server/paid-membership";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const OUTLINE_MAX = CHAPTER_OUTLINE_MAX_CHARS;
const MIN_BODY_CHARS = 40;

/** 与 `chapter-content/route.ts` 一致：正文单独落盘，structure JSON 不含 chapterHtml */
const DEFAULT_DOC_ID = "default";

type ChapterContentPayload = {
  chapterId?: string;
  chapterMarkdown?: string;
  chapterHtml?: string;
  chapterHtmlDesktop?: string;
  chapterHtmlMobile?: string;
};

type StructurePayload = {
  nodes?: Array<{
    id?: string;
    kind?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function safeNovelSegment(novelId: string) {
  return novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return [key, val];
}

async function readFallbackEnv(): Promise<Record<string, string>> {
  const fp = path.join(process.cwd(), "..", "..", ".env.production");
  try {
    const raw = await fs.readFile(fp, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const kv = parseDotEnvLine(line);
      if (!kv) continue;
      out[kv[0]] = kv[1];
    }
    return out;
  } catch {
    return {};
  }
}

function structurePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "structure",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

/** 与 chapter-content/route.ts 的 safeId 对齐 */
function safeIdForChapterContent(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function chapterContentJsonPath(
  authorLower: string,
  novelId: string,
  chapterId: string,
): string {
  const safeDoc = safeIdForChapterContent(
    novelId.trim().length > 0 ? novelId.trim() : DEFAULT_DOC_ID,
  );
  return path.join(
    process.cwd(),
    ".data",
    "chapter-content",
    `${authorLower}_${safeDoc}`,
    `${safeIdForChapterContent(chapterId)}.json`,
  );
}

async function readChapterContentPayload(
  authorLower: string,
  novelId: string,
  chapterId: string,
): Promise<ChapterContentPayload | null> {
  const fp = chapterContentJsonPath(authorLower, novelId, chapterId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    return parseLeadingJsonValue(raw) as ChapterContentPayload;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

function chapterPlainFromContentPayload(p: ChapterContentPayload): string {
  const md = typeof p.chapterMarkdown === "string" ? p.chapterMarkdown.trim() : "";
  if (md.length > 0) {
    return markdownToRoughPlain(md);
  }
  const html =
    (typeof p.chapterHtml === "string" && p.chapterHtml) ||
    (typeof p.chapterHtmlDesktop === "string" && p.chapterHtmlDesktop) ||
    (typeof p.chapterHtmlMobile === "string" && p.chapterHtmlMobile) ||
    "";
  return htmlToPlainText(html);
}

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

function markdownToRoughPlain(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|~~|\*|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chapterPlainFromRecord(ch: {
  title?: string;
  metadata?: Record<string, unknown>;
}): string {
  const meta = (ch?.metadata ?? {}) as Record<string, unknown>;
  const md = typeof meta.chapterMarkdown === "string" ? meta.chapterMarkdown.trim() : "";
  if (md.length > 0) {
    return markdownToRoughPlain(md);
  }
  const html =
    (typeof meta.chapterHtml === "string" && meta.chapterHtml) ||
    (typeof meta.chapterHtmlDesktop === "string" && meta.chapterHtmlDesktop) ||
    (typeof meta.chapterHtmlMobile === "string" && meta.chapterHtmlMobile) ||
    "";
  return htmlToPlainText(html);
}

function excerptOutline(title: string, body: string): string {
  const head = title.trim() ? `【${title.trim()}】\n` : "";
  const raw = `${head}${body}`.trim();
  if (raw.length <= OUTLINE_MAX) return raw;
  const cut = raw.slice(0, OUTLINE_MAX);
  const lastBreak = Math.max(
    cut.lastIndexOf("。"),
    cut.lastIndexOf("！"),
    cut.lastIndexOf("？"),
    cut.lastIndexOf("\n"),
  );
  if (lastBreak >= OUTLINE_MAX * 0.5) {
    return cut.slice(0, lastBreak + 1).trim();
  }
  return `${cut.trim()}…`;
}

async function callDeepseekChapterOutline(
  apiKey: string,
  baseUrl: string,
  model: string,
  chapterTitle: string,
  bodySample: string,
): Promise<string | null> {
  const prompt = [
    "你是中文小说编辑。请根据以下「本章正文节选」写本章剧情大纲。",
    `总字数严格不超过 ${OUTLINE_MAX} 个汉字（含标点）；不要标题行；不要剧透全书仅聚焦本章。`,
    "用简洁的第三人称叙述，可分 2～5 句。",
    "",
    `章节标题：${chapterTitle || "（未命名）"}`,
    "正文节选：",
    bodySample.slice(0, 12000),
  ].join("\n");

  const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: "你只输出正文大纲本身，不要引号、不要 Markdown、不要 JSON。",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return null;
  const cleaned = raw.replace(/^["「]|["」]$/g, "").trim();
  return cleaned.slice(0, OUTLINE_MAX);
}

export async function POST(req: NextRequest) {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return unauthorized("缺少或无效的 x-wallet-address");
  }
  const walletLower = safeAuthorId(headerAddr);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  const novelId = typeof o.novelId === "string" ? o.novelId.trim() : "";
  const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");
  if (!chapterId) return badRequest("Missing chapterId");

  let structure: StructurePayload;
  try {
    const raw = await fs.readFile(structurePath(walletLower, novelId), "utf8");
    structure = parseLeadingJsonValue(raw) as StructurePayload;
  } catch {
    return badRequest("未找到作品大纲数据，请先保存章节结构。");
  }

  const chapters = (structure.nodes ?? []).filter((n) => n.kind === "chapter");
  const ch = chapters.find((n) => n.id === chapterId);
  if (!ch) {
    return badRequest("未找到该章节节点。");
  }

  const title = typeof ch.title === "string" ? ch.title.trim() : "";
  const fromChapterFile = await readChapterContentPayload(
    walletLower,
    novelId,
    chapterId,
  );
  let plain = fromChapterFile ? chapterPlainFromContentPayload(fromChapterFile) : "";
  if (plain.replace(/\s/g, "").length < MIN_BODY_CHARS) {
    plain = chapterPlainFromRecord(ch);
  }
  if (plain.replace(/\s/g, "").length < MIN_BODY_CHARS) {
    return badRequest("本章已保存的正文过少，无法自动提取；可先写正文或使用上传大纲。");
  }

  const envFallback = await readFallbackEnv();
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    envFallback.DEEPSEEK_API_KEY ||
    envFallback.OPENAI_API_KEY;
  const baseUrl =
    process.env.DEEPSEEK_BASE_URL || envFallback.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || envFallback.DEEPSEEK_MODEL || "deepseek-chat";

  const allowDeepseek =
    (await isPaidMemberActive(walletLower)) || (await isAdminWallet(walletLower));
  let outline: string | null = null;
  let generatedBy: "deepseek" | "excerpt" = "excerpt";

  if (allowDeepseek && apiKey) {
    outline = await callDeepseekChapterOutline(apiKey, baseUrl, model, title, plain);
    if (outline && outline.length > 0) {
      generatedBy = "deepseek";
    }
  }

  if (!outline || outline.length === 0) {
    outline = excerptOutline(title, plain);
    generatedBy = "excerpt";
  }

  return NextResponse.json({
    outline: outline.slice(0, OUTLINE_MAX),
    generatedBy,
  });
}
