import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import { persistNovelFromPlainChapters, type PlainChapter } from "@/lib/server/novel-from-txt-persist";

export const runtime = "nodejs";
/** 仅写文件，无切章；保持较短即可，避免反代长时间读超时 */
export const maxDuration = 120;

const MAX_CHAPTERS = 2000;

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

function parseWalletHeader(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: safeAuthorId(headerAddr) };
}

function normalizeChapters(raw: unknown): PlainChapter[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PlainChapter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const content = typeof o.content === "string" ? o.content.trim() : "";
    if (!title || !content) return null;
    out.push({ title, content });
    if (out.length > MAX_CHAPTERS) return null;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") {
    return badRequest("Expected object body");
  }
  const o = body as Record<string, unknown>;

  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  if (!isAddress(authorId)) {
    return badRequest("Invalid authorId");
  }
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title || title.length > 500) {
    return badRequest("Invalid title");
  }
  const description =
    typeof o.description === "string" ? o.description.trim().slice(0, 20000) : "";

  const chapters = normalizeChapters(o.chapters);
  if (!chapters) {
    return badRequest(`无效或空的 chapters（每章需非空 title/content，最多 ${MAX_CHAPTERS} 章）`);
  }

  const batchCount =
    typeof o.batchCount === "number" && Number.isFinite(o.batchCount) && o.batchCount >= 1
      ? Math.floor(o.batchCount)
      : 1;
  const anyTruncated = o.anyTruncated === true;

  const persist = await persistNovelFromPlainChapters({
    walletLower: wh.walletLower,
    title,
    description,
    chapters,
    batchCount,
    anyTruncated,
  });

  if (!persist.ok) {
    const base: Record<string, unknown> = { error: persist.error };
    if (persist.novel) {
      base.novel = persist.novel;
      base.batchCount = persist.batchCount;
      base.anyTruncated = persist.anyTruncated;
      base.chapterCount = persist.chapterCount;
    }
    return NextResponse.json(base, { status: persist.status });
  }

  return NextResponse.json({
    novel: persist.novel,
    batchCount: persist.batchCount,
    anyTruncated: persist.anyTruncated,
    chapterCount: persist.chapterCount,
  });
}
