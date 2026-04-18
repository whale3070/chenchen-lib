import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { NextRequest } from "next/server";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { listRecentDays } from "@/lib/server/wallet-analytics";

const UV_ROOT = path.join(process.cwd(), ".data", "analytics", "article-uv-by-ip");
const PUBLISH_DIR = path.join(process.cwd(), ".data", "publish");
const TZ = "Asia/Shanghai";

const ARTICLE_ID_RE = /^art_[0-9a-f]{10}$/;

let publishArticleIdCache: { ids: Set<string>; at: number } | null = null;
const PUBLISH_ID_CACHE_MS = 60_000;

function dayKeyNow(timeZone = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function normalizeArticleId(articleId: string): string {
  return articleId.trim().toLowerCase();
}

export function isValidArticleIdFormat(articleId: string): boolean {
  return ARTICLE_ID_RE.test(normalizeArticleId(articleId));
}

function safeArticleDirSegment(articleId: string): string {
  return normalizeArticleId(articleId).replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getClientIpFromRequest(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim() ?? "";
    if (first) return first.slice(0, 128);
  }
  const xr = req.headers.get("x-real-ip")?.trim();
  if (xr) return xr.slice(0, 128);
  return "unknown";
}

export function hashIpForArticleUv(clientIp: string): string {
  const salt =
    process.env.ANALYTICS_IP_SALT?.trim() || "dev-article-uv-salt-change-in-prod";
  return crypto.createHmac("sha256", salt).update(clientIp).digest("hex");
}

async function collectAllArticleIdsFromPublishDir(): Promise<Set<string>> {
  const ids = new Set<string>();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(PUBLISH_DIR, { withFileTypes: true });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return ids;
    throw e;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(PUBLISH_DIR, e.name), "utf8");
      const obj = parseLeadingJsonValue(raw) as { articleId?: unknown };
      if (typeof obj.articleId === "string" && obj.articleId.trim()) {
        ids.add(normalizeArticleId(obj.articleId));
      }
    } catch {
      // ignore broken file
    }
  }
  return ids;
}

export async function isKnownPublishedArticleId(articleId: string): Promise<boolean> {
  const id = normalizeArticleId(articleId);
  const now = Date.now();
  if (publishArticleIdCache && now - publishArticleIdCache.at < PUBLISH_ID_CACHE_MS) {
    return publishArticleIdCache.ids.has(id);
  }
  const ids = await collectAllArticleIdsFromPublishDir();
  publishArticleIdCache = { ids, at: now };
  return ids.has(id);
}

export async function recordArticleUvIfNew(params: {
  articleId: string;
  ipHash: string;
}): Promise<{ recorded: boolean }> {
  const articleId = normalizeArticleId(params.articleId);
  const dayKey = dayKeyNow(TZ);
  const seg = safeArticleDirSegment(articleId);
  const dir = path.join(UV_ROOT, dayKey, seg);
  const file = path.join(dir, params.ipHash);
  await fs.mkdir(dir, { recursive: true });
  try {
    const fh = await fs.open(file, "wx");
    await fh.close();
    return { recorded: true };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "EEXIST") return { recorded: false };
    throw e;
  }
}

async function readdirIpHashes(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
  return names.filter((n) => n && n !== "." && n !== "..");
}

/** 多日内同一 IP 只计一次（跨自然日可再计） */
export async function countDistinctIpHashesForArticleInDays(
  articleId: string,
  dayKeys: string[],
): Promise<number> {
  const seg = safeArticleDirSegment(articleId);
  const union = new Set<string>();
  for (const day of dayKeys) {
    const dir = path.join(UV_ROOT, day, seg);
    for (const h of await readdirIpHashes(dir)) {
      union.add(h);
    }
  }
  return union.size;
}

export async function countTodayUvForArticle(articleId: string): Promise<number> {
  const seg = safeArticleDirSegment(articleId);
  const dir = path.join(UV_ROOT, dayKeyNow(TZ), seg);
  const hashes = await readdirIpHashes(dir);
  return hashes.length;
}

export function recentDayKeysShanghai(days: 7 | 30): string[] {
  return listRecentDays({ days, timeZone: TZ });
}

export async function authorOwnsArticleId(
  authorLower: string,
  articleId: string,
): Promise<boolean> {
  const want = normalizeArticleId(articleId);
  const prefix = `${authorLower.toLowerCase()}_`;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(PUBLISH_DIR, { withFileTypes: true });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return false;
    throw e;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".json")) continue;
    if (!e.name.toLowerCase().startsWith(prefix)) continue;
    try {
      const raw = await fs.readFile(path.join(PUBLISH_DIR, e.name), "utf8");
      const obj = parseLeadingJsonValue(raw) as {
        articleId?: unknown;
        authorId?: unknown;
      };
      const aid =
        typeof obj.articleId === "string" ? normalizeArticleId(obj.articleId) : "";
      const auth =
        typeof obj.authorId === "string" ? obj.authorId.trim().toLowerCase() : "";
      if (auth === authorLower.toLowerCase() && aid === want) return true;
    } catch {
      continue;
    }
  }
  return false;
}
