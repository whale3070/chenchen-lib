import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { getDraftFilePath } from "@/lib/draft-path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  publishedChapterIds?: string[];
};

type StructurePayload = {
  nodes?: Array<{
    id: string;
    kind: string;
    title: string;
    metadata?: {
      chapterHtml?: unknown;
      chapterHtmlDesktop?: unknown;
      chapterHtmlMobile?: unknown;
      [k: string]: unknown;
    };
  }>;
  updatedAt?: string;
};

type AuthorNovelIndex = {
  novels?: Array<{
    id?: string;
    title?: string;
  }>;
};

function makeArticleId() {
  return `art_${crypto.randomBytes(5).toString("hex")}`;
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function readerUnlockFilePath(articleId: string, walletLower: string) {
  const safeArticle = articleId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(
    process.cwd(),
    ".data",
    "reader-unlock",
    `${safeArticle}_${walletLower}.json`,
  );
}

async function readPublishRecords() {
  const dir = path.join(process.cwd(), ".data", "publish");
  const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const records: Array<{ filePath: string; data: PublishRecordLite }> = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    const filePath = path.join(dir, file.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      records.push({ filePath, data: JSON.parse(raw) as PublishRecordLite });
    } catch {
      // ignore invalid files
    }
  }
  return records;
}

async function readNovelTitle(authorId: string, novelId: string): Promise<string | null> {
  const fp = path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${authorId.toLowerCase()}.json`,
  );
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as AuthorNovelIndex;
    const n = data.novels?.find((x) => x.id === novelId);
    const title = typeof n?.title === "string" ? n.title.trim() : "";
    return title || null;
  } catch {
    return null;
  }
}

function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Windows Phone/i.test(ua);
}

async function backfillArticleIds(
  records: Array<{ filePath: string; data: PublishRecordLite }>,
) {
  const existing = new Set<string>();
  for (const r of records) {
    if (typeof r.data.articleId === "string" && r.data.articleId.trim()) {
      existing.add(r.data.articleId.trim());
    }
  }
  for (const r of records) {
    if (typeof r.data.articleId === "string" && r.data.articleId.trim()) continue;
    let articleId = makeArticleId();
    while (existing.has(articleId)) {
      articleId = makeArticleId();
    }
    existing.add(articleId);
    r.data.articleId = articleId;
    await fs.writeFile(r.filePath, JSON.stringify(r.data, null, 2), "utf8");
  }
}

export async function GET(req: NextRequest) {
  const records = await readPublishRecords();
  await backfillArticleIds(records);

  const articleId = req.nextUrl.searchParams.get("articleId")?.trim();
  if (!articleId) {
    const publicRecords = records.filter(
      (r) =>
        r.data.visibility === "public" &&
        r.data.articleId &&
        r.data.authorId &&
        r.data.novelId,
    );
    const items = await Promise.all(
      publicRecords.map(async (r) => {
        const novelTitle = await readNovelTitle(r.data.authorId!, r.data.novelId!);
        return {
          articleId: r.data.articleId!,
          title: novelTitle || r.data.title?.trim() || "未命名作品",
          synopsis: r.data.synopsis?.trim() || "",
          publishedAt: r.data.publishedAt || "",
        };
      }),
    );
    items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    return NextResponse.json({ items });
  }

  const rec = records.find(
    (r) => r.data.articleId === articleId && r.data.visibility === "public",
  );
  if (!rec || !rec.data.authorId || !rec.data.novelId) {
    return NextResponse.json({ error: "文章不存在或未公开" }, { status: 404 });
  }

  const novelTitle =
    (await readNovelTitle(rec.data.authorId, rec.data.novelId)) ??
    rec.data.title?.trim() ??
    "未命名作品";

  const draftPath = getDraftFilePath(
    process.cwd(),
    rec.data.authorId,
    rec.data.novelId,
  );
  let html = "";
  let updatedAt = "";
  try {
    const raw = await fs.readFile(draftPath, "utf8");
    const draft = JSON.parse(raw) as { html?: string; updatedAt?: string };
    html = draft.html ?? "";
    updatedAt = draft.updatedAt ?? "";
  } catch {
    // keep empty content if draft not found
  }

  const paymentQrPath = path.join(
    process.cwd(),
    ".data",
    "payment-qr",
    `${rec.data.authorId.toLowerCase()}_${rec.data.novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}.json`,
  );
  let paymentQrImageDataUrl: string | null = null;
  try {
    const raw = await fs.readFile(paymentQrPath, "utf8");
    const qr = JSON.parse(raw) as { imageDataUrl?: string };
    if (typeof qr.imageDataUrl === "string" && qr.imageDataUrl.trim()) {
      paymentQrImageDataUrl = qr.imageDataUrl;
    }
  } catch {
    // optional file
  }

  const safeDoc = rec.data.novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const ua = req.headers.get("user-agent") ?? "";
  const deviceOverride = req.nextUrl.searchParams.get("device");
  const preferMobile =
    deviceOverride === "mobile"
      ? true
      : deviceOverride === "desktop"
        ? false
        : isMobileUserAgent(ua);
  const structurePath = path.join(
    process.cwd(),
    ".data",
    "structure",
    `${rec.data.authorId.toLowerCase()}_${safeDoc}.json`,
  );
  let chapters: Array<{ id: string; title: string; contentHtml: string }> = [];
  try {
    const raw = await fs.readFile(structurePath, "utf8");
    const structure = JSON.parse(raw) as StructurePayload;
    const chapterNodes =
      structure.nodes?.filter(
        (n) => n.kind === "chapter" && typeof n.title === "string",
      ) ?? [];
    chapters = chapterNodes.map((n) => {
      const rawHtml = preferMobile
        ? n.metadata?.chapterHtmlMobile ?? n.metadata?.chapterHtml
        : n.metadata?.chapterHtmlDesktop ?? n.metadata?.chapterHtml;
      const chapterHtml =
        typeof rawHtml === "string" && rawHtml.trim().length > 0
          ? rawHtml
          : "<p></p>";
      return {
        id: n.id,
        title: n.title.trim() || "未命名章节",
        contentHtml: chapterHtml,
      };
    });
  } catch {
    // no structure data, fallback below
  }

  if (chapters.length === 0) {
    chapters = [
      {
        id: "chapter-1",
        title: "第一章",
        contentHtml: html || "<p></p>",
      },
    ];
  } else if (
    chapters.length > 0 &&
    chapters.every((c) => c.contentHtml.trim() === "<p></p>") &&
    html
  ) {
    // Backward compatibility: old draft had one full document but no per-chapter storage.
    chapters[0] = { ...chapters[0], contentHtml: html };
  }

  const publishedIds = Array.isArray(rec.data.publishedChapterIds)
    ? rec.data.publishedChapterIds
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (publishedIds.length > 0) {
    const allow = new Set(publishedIds);
    chapters = chapters.filter((c) => allow.has(c.id));
  }

  const paymentMode = rec.data.paymentMode === "paid" ? "paid" : "free";
  const freePreviewChapters = paymentMode === "paid" ? 5 : chapters.length;
  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  const walletValid = isAddress(wallet);
  let unlocked = paymentMode === "free";
  if (paymentMode === "paid" && walletValid) {
    const fp = readerUnlockFilePath(articleId, wallet.toLowerCase());
    try {
      const raw = await fs.readFile(fp, "utf8");
      const data = JSON.parse(raw) as { unlocked?: boolean };
      unlocked = data.unlocked === true;
    } catch {
      unlocked = false;
    }
  }

  const readableChapters = unlocked
    ? chapters
    : chapters.slice(0, Math.min(freePreviewChapters, chapters.length));

  return NextResponse.json({
    article: {
      articleId,
      authorId: rec.data.authorId,
      title: novelTitle,
      synopsis: rec.data.synopsis?.trim() || "",
      tags: Array.isArray(rec.data.tags)
        ? rec.data.tags
            .filter((x): x is string => typeof x === "string")
            .map((t) => t.replace(/^#+/, "").trim())
            .filter(Boolean)
            .slice(0, 20)
        : [],
      updatedAt,
      paymentMode,
      freePreviewChapters,
      unlocked,
      totalChapters: chapters.length,
      chapters: readableChapters.map(({ title, contentHtml }) => ({ title, contentHtml })),
      paymentQrImageDataUrl,
    },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") {
    return badRequest("Expected object body");
  }
  const b = body as Record<string, unknown>;
  const articleId = typeof b.articleId === "string" ? b.articleId.trim() : "";
  if (!articleId) return badRequest("Missing articleId");

  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(wallet)) {
    return unauthorized("请先连接钱包后再支付解锁");
  }

  const records = await readPublishRecords();
  const rec = records.find(
    (r) => r.data.articleId === articleId && r.data.visibility === "public",
  );
  if (!rec) return NextResponse.json({ error: "文章不存在或未公开" }, { status: 404 });
  if (rec.data.paymentMode !== "paid") {
    return NextResponse.json({ ok: true, unlocked: true });
  }

  const fp = readerUnlockFilePath(articleId, wallet.toLowerCase());
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(
    fp,
    JSON.stringify(
      {
        articleId,
        wallet: wallet.toLowerCase(),
        unlocked: true,
        paidAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  return NextResponse.json({ ok: true, unlocked: true });
}
