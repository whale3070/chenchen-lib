import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type StructurePayload = {
  nodes?: Array<{
    id?: string;
    kind?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }>;
};

type PublishRecordLite = {
  visibility?: "private" | "public";
  publishedChapterIds?: string[];
};

type TranslationStoreLite = {
  languages?: Record<
    string,
    {
      chapters?: Record<
        string,
        {
          translatedText?: string;
          updatedAt?: string;
        }
      >;
    }
  >;
};

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

function structurePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "structure",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function draftPath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "drafts",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function publishPath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "publish",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function translationStorePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "translations",
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

function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translatedLangsForChapter(
  store: TranslationStoreLite | null,
  chapterId: string,
): string[] {
  if (!store?.languages) return [];
  const out: string[] = [];
  for (const [langCode, langNode] of Object.entries(store.languages)) {
    const code = langCode.trim().toLowerCase();
    if (!code) continue;
    const text = langNode?.chapters?.[chapterId]?.translatedText;
    if (typeof text === "string" && text.trim()) out.push(code);
  }
  out.sort();
  return out;
}

function novelTranslationLanguageUnion(
  store: TranslationStoreLite | null,
  chapterIds: string[],
): string[] {
  const set = new Set<string>();
  if (!store?.languages) return [];
  for (const chId of chapterIds) {
    for (const lang of translatedLangsForChapter(store, chId)) {
      set.add(lang);
    }
  }
  return [...set].sort();
}

async function readPublishRecord(
  authorLower: string,
  novelId: string,
): Promise<PublishRecordLite | null> {
  try {
    const raw = await fs.readFile(publishPath(authorLower, novelId), "utf8");
    return parseLeadingJsonValue(raw) as PublishRecordLite;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
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

  let chapters: Array<{
    id: string;
    title: string;
    preview: string;
    isPublished: boolean;
    hasEnglishTranslation: boolean;
    translatedLangs: string[];
  }> = [];
  let novelTranslatedLanguages: string[] = [];

  try {
    const raw = await fs.readFile(structurePath(wh.walletLower, novelId), "utf8");
    const structure = parseLeadingJsonValue(raw) as StructurePayload;
    const chapterNodes = (structure.nodes ?? []).filter((n) => n.kind === "chapter");
    const publishRecord = await readPublishRecord(wh.walletLower, novelId);
    let store: TranslationStoreLite | null = null;
    try {
      const sraw = await fs.readFile(translationStorePath(wh.walletLower, novelId), "utf8");
      store = parseLeadingJsonValue(sraw) as TranslationStoreLite;
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? (e as NodeJS.ErrnoException).code
          : undefined;
      if (code !== "ENOENT") throw e;
    }
    const publishIds = new Set(publishRecord?.publishedChapterIds ?? []);
    const publishAll =
      publishRecord?.visibility === "public" && publishIds.size === 0;
    chapters = chapterNodes
      .map((n) => {
        const id = typeof n.id === "string" ? n.id : "";
        if (!id) return null;
        const htmlCandidate =
          n.metadata?.chapterHtmlMobile ??
          n.metadata?.chapterHtmlDesktop ??
          n.metadata?.chapterHtml;
        const text = typeof htmlCandidate === "string" ? htmlToPlainText(htmlCandidate) : "";
        const translatedLangs = translatedLangsForChapter(store, id);
        return {
          id,
          title: typeof n.title === "string" && n.title.trim() ? n.title.trim() : "未命名章节",
          preview: text.slice(0, 120),
          isPublished: publishAll || publishIds.has(id),
          hasEnglishTranslation: translatedLangs.includes("en"),
          translatedLangs,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    novelTranslatedLanguages = novelTranslationLanguageUnion(
      store,
      chapters.map((c) => c.id),
    );
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }

  let hasDraft = false;
  try {
    const raw = await fs.readFile(draftPath(wh.walletLower, novelId), "utf8");
    const draft = parseLeadingJsonValue(raw) as { html?: unknown };
    hasDraft = typeof draft.html === "string" && draft.html.trim().length > 0;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }

  return NextResponse.json({
    chapters,
    hasDraft,
    novelTranslatedLanguages,
  });
}
