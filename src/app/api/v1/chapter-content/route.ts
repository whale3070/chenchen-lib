import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import {
  chapterContentFilePath,
  writeChapterContentDisk,
} from "@/lib/server/chapter-content-fs";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const DEFAULT_DOC_ID = "default";

/** 与章节正文 `*.json` 区分；列表接口不会把它当作章节内容返回 */
const LEGACY_STRUCTURE_MIGRATION_MARKER = "_legacy-structure-migrated.json";

type ChapterContentPayload = {
  chapterId: string;
  chapterBodySource?: "markdown" | "richtext";
  chapterMarkdown?: string;
  chapterHtml?: string;
  chapterHtmlDesktop?: string;
  chapterHtmlMobile?: string;
  chapterMarkdownEditorDraft?: string;
  updatedAt: string;
};

type StructureFilePayload = {
  nodes?: Array<{
    id?: unknown;
    kind?: unknown;
    metadata?: unknown;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function safeId(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

async function chapterDir(authorId: string, docId: string): Promise<string> {
  const safeDoc = safeId(docId || DEFAULT_DOC_ID);
  const dir = path.join(process.cwd(), ".data", "chapter-content", `${authorId.toLowerCase()}_${safeDoc}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function chapterPath(authorId: string, docId: string, chapterId: string): Promise<string> {
  await chapterDir(authorId, docId);
  return chapterContentFilePath(process.cwd(), authorId, docId, chapterId);
}

function structurePath(authorId: string, docId: string): string {
  const safeDoc = safeId(docId || DEFAULT_DOC_ID).slice(0, 64);
  return path.join(process.cwd(), ".data", "structure", `${authorId.toLowerCase()}_${safeDoc}.json`);
}

function normalizeBody(
  body: Record<string, unknown>,
): Omit<ChapterContentPayload, "chapterId" | "updatedAt"> {
  const out: Omit<ChapterContentPayload, "chapterId" | "updatedAt"> = {};
  if (body.chapterBodySource === "markdown" || body.chapterBodySource === "richtext") {
    out.chapterBodySource = body.chapterBodySource;
  }
  if (typeof body.chapterMarkdown === "string") out.chapterMarkdown = body.chapterMarkdown;
  if (typeof body.chapterHtml === "string") out.chapterHtml = body.chapterHtml;
  if (typeof body.chapterHtmlDesktop === "string") out.chapterHtmlDesktop = body.chapterHtmlDesktop;
  if (typeof body.chapterHtmlMobile === "string") out.chapterHtmlMobile = body.chapterHtmlMobile;
  if (typeof body.chapterMarkdownEditorDraft === "string") {
    out.chapterMarkdownEditorDraft = body.chapterMarkdownEditorDraft;
  }
  return out;
}

function extractLegacyChapterBody(metaRaw: unknown): Omit<ChapterContentPayload, "chapterId" | "updatedAt"> | null {
  if (!metaRaw || typeof metaRaw !== "object") return null;
  const meta = metaRaw as Record<string, unknown>;
  const out: Omit<ChapterContentPayload, "chapterId" | "updatedAt"> = {};
  if (meta.chapterBodySource === "markdown" || meta.chapterBodySource === "richtext") {
    out.chapterBodySource = meta.chapterBodySource;
  }
  if (typeof meta.chapterMarkdown === "string") out.chapterMarkdown = meta.chapterMarkdown;
  if (typeof meta.chapterHtml === "string") out.chapterHtml = meta.chapterHtml;
  if (typeof meta.chapterHtmlDesktop === "string") out.chapterHtmlDesktop = meta.chapterHtmlDesktop;
  if (typeof meta.chapterHtmlMobile === "string") out.chapterHtmlMobile = meta.chapterHtmlMobile;
  if (typeof meta.chapterMarkdownEditorDraft === "string") {
    out.chapterMarkdownEditorDraft = meta.chapterMarkdownEditorDraft;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function legacyMigrationMarkerPath(authorId: string, docId: string): Promise<string> {
  const dir = await chapterDir(authorId, docId);
  return path.join(dir, LEGACY_STRUCTURE_MIGRATION_MARKER);
}

async function legacyStructureMigrated(authorId: string, docId: string): Promise<boolean> {
  try {
    await fs.access(await legacyMigrationMarkerPath(authorId, docId));
    return true;
  } catch {
    return false;
  }
}

/** 每个作品目录至多跑一次：读旧 structure JSON 抽正文；无论是否抽到都落 migratedAt 标记 */
async function ensureLegacyStructureMigrated(authorId: string, docId: string): Promise<void> {
  if (await legacyStructureMigrated(authorId, docId)) return;

  const markerFp = await legacyMigrationMarkerPath(authorId, docId);
  const sfp = structurePath(authorId, docId);
  let raw: string | null = null;
  try {
    raw = await fs.readFile(sfp, "utf8");
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") throw e;
  }

  if (raw) {
    const parsed = parseLeadingJsonValue(raw) as StructureFilePayload;
    const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
    const writes: Promise<void>[] = [];
    for (const n of nodes) {
      if (n?.kind !== "chapter" || typeof n.id !== "string" || !n.id.trim()) continue;
      const body = extractLegacyChapterBody(n.metadata);
      if (!body) continue;
      const payload: ChapterContentPayload = {
        chapterId: n.id,
        ...body,
        updatedAt: new Date().toISOString(),
      };
      const fp = await chapterPath(authorId, docId, n.id);
      writes.push(fs.writeFile(fp, JSON.stringify(payload), "utf8"));
    }
    if (writes.length > 0) {
      await Promise.all(writes);
    }
  }

  await fs.writeFile(
    markerFp,
    JSON.stringify({ migratedAt: new Date().toISOString(), source: "structure-json" }),
    "utf8",
  );
}

function isChapterContentJsonFile(name: string): boolean {
  return name.endsWith(".json") && name !== LEGACY_STRUCTURE_MIGRATION_MARKER;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");

  const b = body as Record<string, unknown>;
  const authorId = typeof b.authorId === "string" ? b.authorId : "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");

  const docId = typeof b.docId === "string" && b.docId.trim() ? b.docId.trim() : DEFAULT_DOC_ID;
  const chapterId = typeof b.chapterId === "string" ? b.chapterId.trim() : "";
  if (!chapterId) return badRequest("Invalid chapterId");

  const content = normalizeBody(b);
  const updatedAt = await writeChapterContentDisk({
    authorLower: authorId.toLowerCase(),
    novelId: docId,
    chapterId,
    payload: { ...content },
  });
  return NextResponse.json({ ok: true, updatedAt });
}

export async function GET(req: NextRequest) {
  const authorId = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");

  const docId = req.nextUrl.searchParams.get("docId")?.trim() || DEFAULT_DOC_ID;
  const chapterId = req.nextUrl.searchParams.get("chapterId")?.trim() || "";
  if (chapterId) {
    const fp = await chapterPath(authorId, docId, chapterId);
    try {
      const raw = await fs.readFile(fp, "utf8");
      const data = parseLeadingJsonValue(raw) as ChapterContentPayload;
      return NextResponse.json({ chapterId, content: data ?? null });
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") {
        await ensureLegacyStructureMigrated(authorId, docId);
        try {
          const raw = await fs.readFile(fp, "utf8");
          const data = parseLeadingJsonValue(raw) as ChapterContentPayload;
          return NextResponse.json({ chapterId, content: data ?? null });
        } catch (e2: unknown) {
          const code2 =
            e2 && typeof e2 === "object" && "code" in e2
              ? (e2 as NodeJS.ErrnoException).code
              : undefined;
          if (code2 === "ENOENT") return NextResponse.json({ chapterId, content: null });
          throw e2;
        }
      }
      throw e;
    }
  }

  const dir = await chapterDir(authorId, docId);
  try {
    let names = await fs.readdir(dir);
    const chapterJsonCount = names.filter(isChapterContentJsonFile).length;
    if (chapterJsonCount === 0 && !(await legacyStructureMigrated(authorId, docId))) {
      await ensureLegacyStructureMigrated(authorId, docId);
      names = await fs.readdir(dir);
    }
    const out: Record<string, ChapterContentPayload> = {};
    await Promise.all(
      names
        .filter(isChapterContentJsonFile)
        .map(async (name) => {
          const fp = path.join(dir, name);
          try {
            const raw = await fs.readFile(fp, "utf8");
            const data = parseLeadingJsonValue(raw) as ChapterContentPayload;
            const id = typeof data?.chapterId === "string" ? data.chapterId : "";
            if (id) out[id] = data;
          } catch {
            /* ignore broken single file */
          }
        }),
    );
    return NextResponse.json({ chapters: out });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return NextResponse.json({ chapters: {} });
    throw e;
  }
}
