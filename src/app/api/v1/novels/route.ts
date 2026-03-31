import { isAddress } from "viem";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { getDraftFilePath } from "@/lib/draft-path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export type NovelMeta = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

/** 列表项：含稿面统计（来自草稿文件）。 */
export type NovelListItem = NovelMeta & {
  wordCount: number;
  lastModified: string;
};

type AuthorNovelsIndex = {
  authorId: string;
  novels: NovelMeta[];
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

function authorIndexPath(authorId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${safeAuthorId(authorId)}.json`,
  );
}

function newNovelId(): string {
  return `nvl-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
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

function stripHtmlForCount(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ");
}

/** 字数：剔除空白后的字符数（适合中文篇幅统计）。 */
function countManuscriptChars(text: string): number {
  return [...text.replace(/\s/g, "")].length;
}

async function readDraftStats(
  authorLower: string,
  novelId: string,
): Promise<{ wordCount: number; draftUpdatedAt: string | null }> {
  const fp = getDraftFilePath(process.cwd(), authorLower, novelId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as { html?: string; updatedAt?: string };
    const html = typeof data.html === "string" ? data.html : "";
    const text = stripHtmlForCount(html);
    const wordCount = countManuscriptChars(text);
    const draftUpdatedAt =
      typeof data.updatedAt === "string" ? data.updatedAt : null;
    return { wordCount, draftUpdatedAt };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return { wordCount: 0, draftUpdatedAt: null };
    throw e;
  }
}

async function readAuthorIndex(authorId: string): Promise<AuthorNovelsIndex> {
  const fp = authorIndexPath(authorId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as AuthorNovelsIndex;
    if (data && Array.isArray(data.novels))
      return { authorId: safeAuthorId(authorId), novels: data.novels };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }
  return { authorId: safeAuthorId(authorId), novels: [] };
}

async function writeAuthorIndex(idx: AuthorNovelsIndex) {
  const fp = authorIndexPath(idx.authorId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(idx, null, 2), "utf8");
}

async function enrichNovels(
  authorLower: string,
  novels: NovelMeta[],
): Promise<NovelListItem[]> {
  return Promise.all(
    novels.map(async (novel) => {
      const stats = await readDraftStats(authorLower, novel.id);
      return {
        ...novel,
        wordCount: stats.wordCount,
        lastModified: stats.draftUpdatedAt ?? novel.updatedAt,
      };
    }),
  );
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const authorIdParam = req.nextUrl.searchParams.get("authorId") ?? "";
  if (!isAddress(authorIdParam)) {
    return badRequest("Invalid authorId");
  }
  if (safeAuthorId(authorIdParam) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const idx = await readAuthorIndex(wh.walletLower);
  const novels = await enrichNovels(idx.authorId, idx.novels);
  return NextResponse.json({ novels });
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

  const now = new Date().toISOString();
  const novel: NovelMeta = {
    id: newNovelId(),
    authorId: wh.walletLower,
    title,
    description,
    createdAt: now,
    updatedAt: now,
  };

  const idx = await readAuthorIndex(wh.walletLower);
  idx.novels.unshift(novel);
  await writeAuthorIndex(idx);

  const listItem: NovelListItem = {
    ...novel,
    wordCount: 0,
    lastModified: novel.updatedAt,
  };
  return NextResponse.json({ novel: listItem });
}
