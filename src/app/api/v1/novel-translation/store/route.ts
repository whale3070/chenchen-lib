import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const MAX_CHAPTER_TRANSLATION_CHARS = 500_000;
const MAX_DRAFT_MANUAL_CHARS = 500_000;
const MAX_META_FIELD_CHARS = 5_000;
const MAX_TAG_LEN = 80;
const MAX_TAGS = 50;

type TranslationStore = {
  authorId: string;
  novelId: string;
  updatedAt: string;
  languages?: Record<
    string,
    {
      updatedAt: string;
      displayTitle?: string;
      displaySynopsis?: string;
      tags?: string[];
      draftText?: string;
      manualText?: string;
      chapters?: Record<
        string,
        {
          translatedText: string;
          updatedAt: string;
        }
      >;
    }
  >;
};

type NovelMetaLite = { id: string; title: string };

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function safeNovelSegment(novelId: string) {
  return novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function translationStorePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "translations",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function structurePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "structure",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function parseWalletHeader(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: safeAuthorId(headerAddr) };
}

async function readAuthorNovelList(authorLower: string): Promise<NovelMetaLite[]> {
  const fp = path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${authorLower}.json`,
  );
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = parseLeadingJsonValue(raw) as { novels?: NovelMetaLite[] };
    if (data?.novels && Array.isArray(data.novels)) return data.novels;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }
  return [];
}

async function readStructureChapterIds(
  authorLower: string,
  novelId: string,
): Promise<string[]> {
  try {
    const raw = await fs.readFile(structurePath(authorLower, novelId), "utf8");
    const parsed = parseLeadingJsonValue(raw) as {
      nodes?: Array<{ id?: unknown; kind?: unknown }>;
    };
    return (parsed.nodes ?? [])
      .filter((n) => n?.kind === "chapter" && typeof n?.id === "string")
      .map((n) => String(n.id).trim())
      .filter(Boolean)
      .slice(0, 2000);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
}

function isValidLanguageCode(code: string): boolean {
  return /^[a-z0-9-]{1,24}$/i.test(code);
}

function parseTags(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((x): x is string => typeof x === "string")
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean)
    .map((t) => t.slice(0, MAX_TAG_LEN))
    .slice(0, MAX_TAGS);
  return out;
}

async function loadStore(
  authorLower: string,
  novelId: string,
): Promise<TranslationStore> {
  const fp = translationStorePath(authorLower, novelId);
  const empty: TranslationStore = {
    authorId: authorLower,
    novelId,
    updatedAt: new Date().toISOString(),
    languages: {},
  };
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = parseLeadingJsonValue(raw) as TranslationStore;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.authorId === authorLower &&
      parsed.novelId === novelId
    ) {
      return {
        ...parsed,
        languages:
          parsed.languages && typeof parsed.languages === "object"
            ? parsed.languages
            : {},
      };
    }
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }
  return empty;
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const authorIdParam = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorIdParam)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorIdParam) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const novelId = req.nextUrl.searchParams.get("novelId")?.trim() ?? "";
  if (!novelId) return badRequest("Missing novelId");

  const novels = await readAuthorNovelList(wh.walletLower);
  if (!novels.some((n) => n.id === novelId)) {
    return NextResponse.json({ error: "未找到该小说" }, { status: 404 });
  }

  const store = await loadStore(wh.walletLower, novelId);
  return NextResponse.json({ store });
}

export async function PATCH(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const authorIdParam =
    typeof body.authorId === "string" ? body.authorId.trim() : "";
  if (!isAddress(authorIdParam)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorIdParam) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const novelId = typeof body.novelId === "string" ? body.novelId.trim() : "";
  if (!novelId) return badRequest("Missing novelId");

  const novels = await readAuthorNovelList(wh.walletLower);
  if (!novels.some((n) => n.id === novelId)) {
    return NextResponse.json({ error: "未找到该小说" }, { status: 404 });
  }

  const languageRaw = typeof body.language === "string" ? body.language.trim() : "";
  const language = languageRaw.toLowerCase();
  if (!language || !isValidLanguageCode(language)) {
    return badRequest("Invalid or missing language");
  }

  const chapterId =
    typeof body.chapterId === "string" ? body.chapterId.trim() : undefined;
  const translatedText =
    typeof body.translatedText === "string" ? body.translatedText : undefined;

  const hasChapterPatch = chapterId !== undefined && translatedText !== undefined;
  const hasDisplayTitle = typeof body.displayTitle === "string";
  const hasDisplaySynopsis = typeof body.displaySynopsis === "string";
  const hasTags = body.tags !== undefined;
  const hasDraft = typeof body.draftText === "string";
  const hasManual = typeof body.manualText === "string";

  if (
    !hasChapterPatch &&
    !hasDisplayTitle &&
    !hasDisplaySynopsis &&
    !hasTags &&
    !hasDraft &&
    !hasManual
  ) {
    return badRequest("至少需要提供一项要保存的字段");
  }

  if (chapterId !== undefined && translatedText === undefined) {
    return badRequest("提供 chapterId 时必须同时提供 translatedText");
  }
  if (translatedText !== undefined && !chapterId) {
    return badRequest("提供 translatedText 时必须同时提供 chapterId");
  }

  if (hasChapterPatch && chapterId) {
    const allowed = new Set(await readStructureChapterIds(wh.walletLower, novelId));
    if (!allowed.has(chapterId)) {
      return badRequest("chapterId 不在当前作品大纲中");
    }
    if (translatedText.length > MAX_CHAPTER_TRANSLATION_CHARS) {
      return badRequest("译文过长");
    }
  }

  if (hasDisplayTitle) {
    const t = body.displayTitle as string;
    if (t.length > MAX_META_FIELD_CHARS) return badRequest("displayTitle 过长");
  }
  if (hasDisplaySynopsis) {
    const t = body.displaySynopsis as string;
    if (t.length > MAX_META_FIELD_CHARS) return badRequest("displaySynopsis 过长");
  }
  let tagsParsed: string[] | undefined;
  if (hasTags) {
    tagsParsed = parseTags(body.tags);
    if (tagsParsed === undefined) return badRequest("tags 须为字符串数组");
  }
  if (hasDraft) {
    const t = body.draftText as string;
    if (t.length > MAX_DRAFT_MANUAL_CHARS) return badRequest("draftText 过长");
  }
  if (hasManual) {
    const t = body.manualText as string;
    if (t.length > MAX_DRAFT_MANUAL_CHARS) return badRequest("manualText 过长");
  }

  const store = await loadStore(wh.walletLower, novelId);
  const nowIso = new Date().toISOString();
  const prevLang = store.languages?.[language] ?? { updatedAt: nowIso };
  const nextLang = { ...prevLang, updatedAt: nowIso };

  if (hasChapterPatch && chapterId) {
    nextLang.chapters = {
      ...(nextLang.chapters ?? {}),
      [chapterId]: {
        translatedText: translatedText as string,
        updatedAt: nowIso,
      },
    };
  }
  if (hasDisplayTitle) {
    nextLang.displayTitle = body.displayTitle as string;
  }
  if (hasDisplaySynopsis) {
    nextLang.displaySynopsis = body.displaySynopsis as string;
  }
  if (tagsParsed !== undefined) {
    nextLang.tags = tagsParsed;
  }
  if (hasDraft) {
    nextLang.draftText = body.draftText as string;
  }
  if (hasManual) {
    nextLang.manualText = body.manualText as string;
  }

  store.updatedAt = nowIso;
  store.languages = {
    ...(store.languages ?? {}),
    [language]: nextLang,
  };

  const fp = translationStorePath(wh.walletLower, novelId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(store, null, 2), "utf8");

  return NextResponse.json({ ok: true, store });
}
