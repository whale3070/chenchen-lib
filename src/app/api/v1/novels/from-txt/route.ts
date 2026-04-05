import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import {
  ChapterizeHttpError,
  chapterizeTextInternal,
  type ChapterizeMode,
} from "@/lib/server/chapterize-internal";
import { persistNovelFromPlainChapters } from "@/lib/server/novel-from-txt-persist";
import {
  buildChapterizeBatches,
  type ChapterizeTxtMode,
} from "@/lib/txt-import-chapterize";

export const runtime = "nodejs";
/** 长文多批切章可能较慢（建议工作台改用浏览器分批 + from-chapters） */
export const maxDuration = 300;

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

async function chapterizeInProcess(
  text: string,
  mode: ChapterizeTxtMode,
): Promise<{
  chapters: Array<{ title: string; content: string }>;
  batchCount: number;
  anyTruncated: boolean;
}> {
  const batches = buildChapterizeBatches(text, 38000);
  if (batches.length === 0) {
    throw new Error("文本为空，无法切章");
  }
  const internalMode: ChapterizeMode = mode === "rule" ? "rule" : "auto";
  const merged: Array<{ title: string; content: string }> = [];
  let anyTruncated = false;
  for (let i = 0; i < batches.length; i += 1) {
    try {
      const r = await chapterizeTextInternal(batches[i]!, internalMode);
      if (r.chapters.length === 0) {
        throw new ChapterizeHttpError(500, "切章结果为空");
      }
      merged.push(...r.chapters);
      anyTruncated = anyTruncated || r.truncated;
    } catch (e) {
      const suffix = `（分批 ${i + 1}/${batches.length}）`;
      if (e instanceof ChapterizeHttpError) {
        throw new Error(`${e.message}${suffix}`);
      }
      throw new Error(
        `${e instanceof Error ? e.message : "切章失败"}${suffix}`,
      );
    }
  }
  if (merged.length === 0) {
    throw new Error("切章结果为空");
  }
  return { chapters: merged, batchCount: batches.length, anyTruncated };
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

  const text = typeof o.text === "string" ? o.text : "";
  if (!text.trim()) {
    return badRequest("缺少正文 text");
  }

  const mode: ChapterizeTxtMode =
    o.mode === "rule" || o.mode === "auto" ? o.mode : "auto";

  let chapters: Array<{ title: string; content: string }>;
  let batchCount: number;
  let anyTruncated: boolean;
  try {
    const r = await chapterizeInProcess(text, mode);
    chapters = r.chapters;
    batchCount = r.batchCount;
    anyTruncated = r.anyTruncated;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "切章失败";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const persist = await persistNovelFromPlainChapters({
    walletLower: wh.walletLower,
    title,
    description,
    chapters,
    batchCount,
    anyTruncated,
  });

  if (!persist.ok) {
    if (persist.status === 400) {
      return badRequest(persist.error);
    }
    const payload: Record<string, unknown> = { error: persist.error };
    if (persist.novel) {
      payload.novel = persist.novel;
      payload.batchCount = persist.batchCount;
      payload.anyTruncated = persist.anyTruncated;
      payload.chapterCount = persist.chapterCount;
    }
    return NextResponse.json(payload, { status: persist.status });
  }

  return NextResponse.json({
    novel: persist.novel,
    batchCount: persist.batchCount,
    anyTruncated: persist.anyTruncated,
    chapterCount: persist.chapterCount,
  });
}
