import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import { getDraftFilePath } from "@/lib/draft-path";
import { parseLeadingJsonValue } from "@/lib/parse-leading-json";

export const runtime = "nodejs";

type NovelMeta = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type AuthorNovelsIndex = {
  authorId: string;
  novels: NovelMeta[];
};

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

function structurePath(authorId: string, docId: string) {
  const safeDoc = docId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(
    process.cwd(),
    ".data",
    "structure",
    `${safeAuthorId(authorId)}_${safeDoc}.json`,
  );
}

function publishRecordPath(authorId: string, novelId: string) {
  const safeDoc = novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(process.cwd(), ".data", "publish", `${safeAuthorId(authorId)}_${safeDoc}.json`);
}

function newNovelId(): string {
  return `nvl-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
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

async function readAuthorIndex(authorId: string): Promise<AuthorNovelsIndex> {
  const fp = authorIndexPath(authorId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = parseLeadingJsonValue(raw) as AuthorNovelsIndex;
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

async function readSourceArticleIdIfPublic(
  sourceAuthorId: string,
  sourceWorkId: string,
): Promise<string | null> {
  try {
    const fp = publishRecordPath(sourceAuthorId, sourceWorkId);
    const raw = await fs.readFile(fp, "utf8");
    const parsed = parseLeadingJsonValue(raw) as {
      visibility?: "private" | "public";
      articleId?: string;
    };
    if (parsed.visibility !== "public") return null;
    const aid = typeof parsed.articleId === "string" ? parsed.articleId.trim() : "";
    return aid || null;
  } catch {
    return null;
  }
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
  const sourceAuthorId = typeof o.sourceAuthorId === "string" ? o.sourceAuthorId.trim() : "";
  const sourceWorkId = typeof o.sourceWorkId === "string" ? o.sourceWorkId.trim() : "";
  const sourceBranchId =
    typeof o.sourceBranchId === "string" && o.sourceBranchId.trim().length > 0
      ? o.sourceBranchId.trim()
      : "main";
  if (!isAddress(sourceAuthorId)) return badRequest("Invalid sourceAuthorId");
  if (!sourceWorkId) return badRequest("Missing sourceWorkId");
  const sourceAuthorLower = safeAuthorId(sourceAuthorId);
  if (sourceAuthorLower === wh.walletLower) {
    return forbidden("不能 Fork 自己的作品，请在作者工作台直接创建分支");
  }

  const sourceIdx = await readAuthorIndex(sourceAuthorLower);
  const sourceNovel = sourceIdx.novels.find((n) => n.id === sourceWorkId);
  if (!sourceNovel) {
    return NextResponse.json({ error: "源作品不存在" }, { status: 404 });
  }
  const sourceArticleId = await readSourceArticleIdIfPublic(sourceAuthorLower, sourceWorkId);

  const now = new Date().toISOString();
  const targetIdx = await readAuthorIndex(wh.walletLower);
  const targetTitleBase = sourceNovel.title.trim() || "未命名作品";
  const targetTitle = `${targetTitleBase}（Fork）`.slice(0, 500);
  const targetNovel: NovelMeta = {
    id: newNovelId(),
    authorId: wh.walletLower,
    title: targetTitle,
    description:
      `Fork 自 ${sourceNovel.authorId} 的《${targetTitleBase}》` +
      `（源分支：${sourceBranchId}）`,
    createdAt: now,
    updatedAt: now,
  };
  targetIdx.novels.unshift(targetNovel);
  await writeAuthorIndex(targetIdx);

  // Copy structure snapshot if exists
  const srcStructure = structurePath(sourceAuthorLower, sourceWorkId);
  const dstStructure = structurePath(wh.walletLower, targetNovel.id);
  try {
    const raw = await fs.readFile(srcStructure, "utf8");
    const parsed = parseLeadingJsonValue(raw) as Record<string, unknown>;
    const next = {
      ...parsed,
      authorId: wh.walletLower,
      docId: targetNovel.id,
      updatedAt: now,
    };
    await fs.mkdir(path.dirname(dstStructure), { recursive: true });
    await fs.writeFile(dstStructure, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // structure can be absent; keep fork minimal
  }

  // Copy draft snapshot if exists
  const srcDraft = getDraftFilePath(process.cwd(), sourceAuthorLower, sourceWorkId);
  const dstDraft = getDraftFilePath(process.cwd(), wh.walletLower, targetNovel.id);
  try {
    const raw = await fs.readFile(srcDraft, "utf8");
    const parsed = parseLeadingJsonValue(raw) as Record<string, unknown>;
    const next = {
      ...parsed,
      authorId: wh.walletLower,
      docId: targetNovel.id,
      updatedAt: now,
      lastActionTimestamp: Date.now(),
    };
    await fs.mkdir(path.dirname(dstDraft), { recursive: true });
    await fs.writeFile(dstDraft, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // draft can be absent; keep fork minimal
  }

  // Persist fork lineage + license / royalty snapshots (MVP placeholders)
  const forkId = `fork-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const forkPath = path.join(process.cwd(), ".data", "versioning", "forks", `${forkId}.json`);
  await fs.mkdir(path.dirname(forkPath), { recursive: true });
  await fs.writeFile(
    forkPath,
    JSON.stringify(
      {
        id: forkId,
        source_work_id: sourceWorkId,
        source_branch_id: sourceBranchId,
        source_commit_id: null,
        source_author_id: sourceAuthorLower,
        source_article_id: sourceArticleId,
        forked_work_id: targetNovel.id,
        forked_branch_id: "main",
        fork_owner_id: wh.walletLower,
        license_snapshot: {
          template: "inherit_source_mvp",
          allow_fork: true,
          allow_commercial_use: false,
          require_attribution: true,
        },
        royalty_snapshot: {
          model: "fixed_ratio_mvp",
          items: [
            { role: "original_author", percentage: 20 },
            { role: "fork_author", percentage: 70 },
            { role: "platform", percentage: 10 },
          ],
        },
        status: "active",
        created_at: now,
      },
      null,
      2,
    ),
    "utf8",
  );

  return NextResponse.json({
    ok: true,
    forkId,
    novel: targetNovel,
    sourceArticleId,
  });
}

