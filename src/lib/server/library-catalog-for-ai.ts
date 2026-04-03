import fs from "node:fs/promises";
import path from "node:path";

import type { ReaderAiCatalogItem } from "@/types/reader-ai-recommend";

type PublishRecordLite = {
  articleId?: string;
  authorId?: string;
  novelId?: string;
  title?: string;
  synopsis?: string;
  tags?: string[];
  visibility?: "private" | "public";
  paymentMode?: "free" | "paid";
  publishedAt?: string;
};

type StructurePayload = {
  nodes?: Array<{ kind?: string }>;
};

const TRIAL_MAX = 5;
const TRIAL_MIN = 3;

async function readPublishRecords(): Promise<
  Array<{ filePath: string; data: PublishRecordLite }>
> {
  const dir = path.join(process.cwd(), ".data", "publish");
  const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const records: Array<{ filePath: string; data: PublishRecordLite }> = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    const filePath = path.join(dir, file.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw) as PublishRecordLite;
      if (!data.authorId || !data.novelId) {
        const base = path.basename(filePath, ".json");
        const sep = base.indexOf("_");
        if (sep > 0 && sep < base.length - 1) {
          if (!data.authorId) data.authorId = base.slice(0, sep).trim().toLowerCase();
          if (!data.novelId) data.novelId = base.slice(sep + 1).trim();
        }
      }
      records.push({ filePath, data });
    } catch {
      /* skip */
    }
  }
  return records;
}

async function readNovelTitle(
  authorId: string,
  novelId: string,
): Promise<string | null> {
  const fp = path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${authorId.toLowerCase()}.json`,
  );
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as {
      novels?: Array<{ id?: string; title?: string }>;
    };
    const n = data.novels?.find((x) => x.id === novelId);
    const t = typeof n?.title === "string" ? n.title.trim() : "";
    return t || null;
  } catch {
    return null;
  }
}

async function countChapters(
  authorId: string,
  novelId: string,
): Promise<number> {
  const safeDoc = novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const structurePath = path.join(
    process.cwd(),
    ".data",
    "structure",
    `${authorId.toLowerCase()}_${safeDoc}.json`,
  );
  try {
    const raw = await fs.readFile(structurePath, "utf8");
    const structure = JSON.parse(raw) as StructurePayload;
    return (
      structure.nodes?.filter((n) => n.kind === "chapter").length ?? 0
    );
  } catch {
    return 0;
  }
}

function trialChapterCount(total: number): number {
  if (total <= 0) return TRIAL_MIN;
  return Math.min(TRIAL_MAX, Math.max(TRIAL_MIN, total));
}

function normalizePaymentMode(raw: unknown): "free" | "paid" {
  return raw === "paid" ? "paid" : "free";
}

/**
 * 书库内所有「公开」作品，供 AI 推荐（含免费与付费）
 */
export async function buildPublicCatalogForAi(options?: {
  maxItems?: number;
}): Promise<ReaderAiCatalogItem[]> {
  const maxItems = options?.maxItems ?? 300;
  const records = await readPublishRecords();
  const candidates = records
    .filter(
      (r) =>
        r.data.visibility === "public" &&
        typeof r.data.articleId === "string" &&
        r.data.articleId.trim() &&
        r.data.authorId &&
        r.data.novelId,
    )
    .sort((a, b) =>
      (a.data.publishedAt || "") < (b.data.publishedAt || "") ? 1 : -1,
    );

  const items: ReaderAiCatalogItem[] = [];
  for (const r of candidates) {
    if (items.length >= maxItems) break;
    const authorId = r.data.authorId!;
    const novelId = r.data.novelId!;
    const articleId = r.data.articleId!.trim();
    const novelTitle = (await readNovelTitle(authorId, novelId)) ?? "";
    const title = novelTitle || r.data.title?.trim() || "未命名作品";
    const synopsis = r.data.synopsis?.trim() ?? "";
    const tags = Array.isArray(r.data.tags)
      ? r.data.tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 24)
      : [];
    const totalChapters = await countChapters(authorId, novelId);
    const paymentMode = normalizePaymentMode(r.data.paymentMode);
    const trialChapters = trialChapterCount(totalChapters);
    items.push({
      articleId,
      title,
      synopsisSnippet: synopsis.slice(0, 280),
      tags,
      totalChapters,
      language: "zh",
      trialChapters,
      paymentMode,
    });
  }
  return items;
}
