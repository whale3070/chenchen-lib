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
  visibility?: "private" | "public";
  publishedAt?: string;
};

function makeArticleId() {
  return `art_${crypto.randomBytes(5).toString("hex")}`;
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
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
    const items = records
      .filter((r) => r.data.visibility === "public" && r.data.articleId)
      .map((r) => ({
        articleId: r.data.articleId!,
        title: r.data.title?.trim() || "未命名作品",
        synopsis: r.data.synopsis?.trim() || "",
        publishedAt: r.data.publishedAt || "",
      }))
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    return NextResponse.json({ items });
  }

  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(wallet)) {
    return unauthorized("请先连接钱包后再阅读");
  }

  const rec = records.find(
    (r) => r.data.articleId === articleId && r.data.visibility === "public",
  );
  if (!rec || !rec.data.authorId || !rec.data.novelId) {
    return NextResponse.json({ error: "文章不存在或未公开" }, { status: 404 });
  }

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

  return NextResponse.json({
    article: {
      articleId,
      title: rec.data.title?.trim() || "未命名作品",
      synopsis: rec.data.synopsis?.trim() || "",
      contentHtml: html,
      updatedAt,
    },
  });
}
