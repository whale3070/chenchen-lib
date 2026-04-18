import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

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

/** 仅允许 a-z 两字母码（与现有翻译存储一致） */
function normalizeLangParam(lang: string): string | null {
  const s = lang.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(s)) return null;
  return s;
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const authorIdParam = req.nextUrl.searchParams.get("authorId")?.trim() ?? "";
  if (!isAddress(authorIdParam)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorIdParam) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const novelId = req.nextUrl.searchParams.get("novelId")?.trim() ?? "";
  const chapterId = req.nextUrl.searchParams.get("chapterId")?.trim() ?? "";
  const langRaw = req.nextUrl.searchParams.get("lang")?.trim() ?? "";
  const lang = normalizeLangParam(langRaw);
  if (!novelId) return badRequest("Missing novelId");
  if (!chapterId) return badRequest("Missing chapterId");
  if (!lang) return badRequest("Missing or invalid lang (use two-letter code, e.g. en, ja)");

  const fp = translationStorePath(wh.walletLower, novelId);
  let store: TranslationStoreLite;
  try {
    const raw = await fs.readFile(fp, "utf8");
    store = parseLeadingJsonValue(raw) as TranslationStoreLite;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") {
      return NextResponse.json({ translatedText: "", updatedAt: null });
    }
    throw e;
  }

  const node = store.languages?.[lang]?.chapters?.[chapterId];
  const translatedText =
    typeof node?.translatedText === "string" ? node.translatedText : "";
  const updatedAt = typeof node?.updatedAt === "string" ? node.updatedAt : null;

  return NextResponse.json({
    translatedText,
    updatedAt,
  });
}
