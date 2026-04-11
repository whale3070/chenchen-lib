import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type ChapterComment = {
  id: string;
  articleId: string;
  chapterId: string;
  wallet: string;
  content: string;
  createdAt: string;
};

export type DeleteCommentResult =
  | { ok: true; removed: ChapterComment }
  | { ok: false; reason: "not_found" | "forbidden" };

const COMMENTS_DIR = path.join(process.cwd(), ".data", "comments");
const POST_GAP_MS = 3_000;
const MEMORY_TTL_MS = 5 * 60_000;
const postGate = new Map<string, number>();

type Listener = (comment: ChapterComment) => void;
const listeners = new Map<string, Set<Listener>>();

function streamKey(articleId: string, chapterId: string) {
  return `${articleId}::${chapterId}`;
}

function safeSeg(raw: string, max = 120) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, max);
}

function commentsPath(articleId: string, chapterId: string) {
  return path.join(COMMENTS_DIR, safeSeg(articleId, 64), `${safeSeg(chapterId)}.jsonl`);
}

function cleanupPostGate(now: number) {
  for (const [k, ts] of postGate.entries()) {
    if (now - ts > MEMORY_TTL_MS) postGate.delete(k);
  }
}

export function canPostComment(walletLower: string, articleId: string, chapterId: string) {
  const now = Date.now();
  cleanupPostGate(now);
  const key = `${walletLower}::${articleId}::${chapterId}`;
  const last = postGate.get(key) ?? 0;
  if (now - last < POST_GAP_MS) return false;
  postGate.set(key, now);
  return true;
}

export async function listComments(
  articleId: string,
  chapterId: string,
  limit = 100,
): Promise<ChapterComment[]> {
  const fp = commentsPath(articleId, chapterId);
  let raw = "";
  try {
    raw = await fs.readFile(fp, "utf8");
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
  const rows = raw
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const parsed: ChapterComment[] = [];
  for (const line of rows) {
    try {
      const c = JSON.parse(line) as Partial<ChapterComment>;
      if (
        typeof c.id === "string" &&
        typeof c.articleId === "string" &&
        typeof c.chapterId === "string" &&
        typeof c.wallet === "string" &&
        typeof c.content === "string" &&
        typeof c.createdAt === "string"
      ) {
        parsed.push({
          id: c.id,
          articleId: c.articleId,
          chapterId: c.chapterId,
          wallet: c.wallet.toLowerCase(),
          content: c.content,
          createdAt: c.createdAt,
        });
      }
    } catch {
      // ignore broken lines
    }
  }
  if (parsed.length <= limit) return parsed;
  return parsed.slice(parsed.length - limit);
}

export async function appendComment(params: {
  articleId: string;
  chapterId: string;
  walletLower: string;
  content: string;
}): Promise<ChapterComment> {
  const row: ChapterComment = {
    id: `cmt_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
    articleId: params.articleId,
    chapterId: params.chapterId,
    wallet: params.walletLower,
    content: params.content.trim().slice(0, 800),
    createdAt: new Date().toISOString(),
  };
  const fp = commentsPath(params.articleId, params.chapterId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, `${JSON.stringify(row)}\n`, "utf8");
  publishComment(row);
  return row;
}

export async function deleteComment(params: {
  articleId: string;
  chapterId: string;
  commentId: string;
  walletLower: string;
}): Promise<DeleteCommentResult> {
  const fp = commentsPath(params.articleId, params.chapterId);
  let raw = "";
  try {
    raw = await fs.readFile(fp, "utf8");
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return { ok: false, reason: "not_found" };
    throw e;
  }
  const lines = raw
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const next: string[] = [];
  let target: ChapterComment | null = null;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as ChapterComment;
      if (row.id === params.commentId && row.articleId === params.articleId && row.chapterId === params.chapterId) {
        target = {
          ...row,
          wallet: row.wallet.toLowerCase(),
        };
        continue;
      }
    } catch {
      // keep malformed lines as-is to avoid data loss
    }
    next.push(line);
  }
  if (!target) return { ok: false, reason: "not_found" };
  if (target.wallet !== params.walletLower) return { ok: false, reason: "forbidden" };
  const content = next.length > 0 ? `${next.join("\n")}\n` : "";
  await fs.writeFile(fp, content, "utf8");
  return { ok: true, removed: target };
}

export function publishComment(comment: ChapterComment) {
  const key = streamKey(comment.articleId, comment.chapterId);
  const bag = listeners.get(key);
  if (!bag || bag.size === 0) return;
  for (const l of bag) l(comment);
}

export function subscribeComments(
  articleId: string,
  chapterId: string,
  listener: Listener,
): () => void {
  const key = streamKey(articleId, chapterId);
  let bag = listeners.get(key);
  if (!bag) {
    bag = new Set<Listener>();
    listeners.set(key, bag);
  }
  bag.add(listener);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(key);
  };
}
