/**
 * 发布模块 API — 持久化作者发布配置（本地 JSON）
 * TODO: 同步至读者端、支付、结算
 */

import { isAddress } from "viem";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { NovelPublishRecord } from "@/lib/novel-publish";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

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

function publishFilePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "publish",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function makeArticleId() {
  return `art_${crypto.randomBytes(5).toString("hex")}`;
}

async function collectAssignedArticleIds() {
  const dir = path.join(process.cwd(), ".data", "publish");
  const ids = new Set<string>();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, e.name), "utf8");
        const obj = JSON.parse(raw) as { articleId?: unknown };
        if (typeof obj.articleId === "string" && obj.articleId.trim()) {
          ids.add(obj.articleId.trim());
        }
      } catch {
        // ignore broken file and continue
      }
    }
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }
  return ids;
}

async function allocateArticleId() {
  const existing = await collectAssignedArticleIds();
  let id = makeArticleId();
  while (existing.has(id)) {
    id = makeArticleId();
  }
  return id;
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

type NovelMetaLite = { id: string; title: string };

async function readAuthorNovelList(authorLower: string): Promise<NovelMetaLite[]> {
  const fp = path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${authorLower}.json`,
  );
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as { novels?: NovelMetaLite[] };
    if (data?.novels && Array.isArray(data.novels)) return data.novels;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }
  return [];
}

async function readPublishRecord(
  authorLower: string,
  novelId: string,
): Promise<NovelPublishRecord | null> {
  const fp = publishFilePath(authorLower, novelId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as NovelPublishRecord;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

async function writePublishRecord(rec: NovelPublishRecord) {
  const fp = publishFilePath(rec.authorId, rec.novelId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(rec, null, 2), "utf8");
}

/** 列表或单本 */
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

  const novelId = req.nextUrl.searchParams.get("novelId")?.trim();

  if (novelId) {
    const novels = await readAuthorNovelList(wh.walletLower);
    if (!novels.some((n) => n.id === novelId)) {
      return NextResponse.json({ error: "未找到该小说" }, { status: 404 });
    }
    const record = await readPublishRecord(wh.walletLower, novelId);
    return NextResponse.json({ record });
  }

  const novels = await readAuthorNovelList(wh.walletLower);
  const items = await Promise.all(
    novels.map(async (n) => {
      const record = await readPublishRecord(wh.walletLower, n.id);
      return {
        novelId: n.id,
        novelTitle: n.title,
        record,
      };
    }),
  );
  return NextResponse.json({ items });
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** 保存发布配置 或 action:withdraw */
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
  if (!isAddress(authorId) || safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const novelId = typeof o.novelId === "string" ? o.novelId.trim() : "";
  if (!novelId) return badRequest("Missing novelId");

  const novels = await readAuthorNovelList(wh.walletLower);
  if (!novels.some((n) => n.id === novelId)) {
    return NextResponse.json({ error: "未找到该小说" }, { status: 404 });
  }

  const action = o.action === "withdraw" ? "withdraw" : "publish";

  if (action === "withdraw") {
    const existing = await readPublishRecord(wh.walletLower, novelId);
    if (!existing) {
      return badRequest("无可撤回的配置");
    }
    if (existing.visibility !== "public" || existing.paymentMode !== "free") {
      return badRequest(
        "仅「已公开 · 免费阅读」作品支持撤回至草稿；付费连载请通过客服处理。",
      );
    }
    const next: NovelPublishRecord = {
      ...existing,
      visibility: "private",
      paymentMode: "free",
      priceAmount: "",
      currency: "HKD",
      withdrawnAt: new Date().toISOString(),
      publishedAt: existing.publishedAt,
      articleId: existing.articleId,
    };
    await writePublishRecord(next);
    return NextResponse.json({ record: next, ok: true });
  }

  const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
  if (!title) return badRequest("请填写小说标题");
  const synopsis =
    typeof o.synopsis === "string" ? o.synopsis.trim().slice(0, 5000) : "";

  const visibility = (o as { visibility?: string }).visibility;
  if (visibility !== "private" && visibility !== "public") {
    return badRequest("Invalid visibility");
  }
  const paymentMode = (o as { paymentMode?: string }).paymentMode;
  if (paymentMode !== "free" && paymentMode !== "paid") {
    return badRequest("Invalid paymentMode");
  }

  const currencyRaw = (o as { currency?: string }).currency;
  const currency =
    currencyRaw === "USD" || currencyRaw === "CNY"
      ? currencyRaw
      : "HKD";

  const priceAmount =
    typeof o.priceAmount === "string" ? o.priceAmount.trim().slice(0, 32) : "";

  if (paymentMode === "paid") {
    if (!priceAmount || !/^\d+(\.\d{1,2})?$/.test(priceAmount)) {
      return badRequest("请输入有效付费金额");
    }
  }

  let updateCommitment: "none" | number = "none";
  const uc = o.updateCommitment;
  if (typeof uc === "number" && Number.isInteger(uc) && uc >= 1 && uc <= 7) {
    updateCommitment = uc;
  } else if (uc === "none" || uc === null || uc === undefined) {
    updateCommitment = "none";
  } else {
    return badRequest("Invalid updateCommitment");
  }

  const refundRuleAck = o.refundRuleAck === true;
  if (updateCommitment !== "none" && !refundRuleAck) {
    return badRequest("选择周更承诺需勾选烂尾退款规则");
  }

  const tags = parseTags(o.tags);

  const existing = await readPublishRecord(wh.walletLower, novelId);
  const articleId = existing?.articleId ?? (await allocateArticleId());

  const record: NovelPublishRecord = {
    articleId,
    authorId: wh.walletLower,
    novelId,
    title,
    synopsis,
    tags,
    visibility,
    paymentMode,
    currency,
    priceAmount: paymentMode === "paid" ? priceAmount : "",
    updateCommitment,
    refundRuleAck,
    publishedAt: new Date().toISOString(),
    withdrawnAt: null,
  };

  await writePublishRecord(record);
  return NextResponse.json({ record, ok: true });
}
