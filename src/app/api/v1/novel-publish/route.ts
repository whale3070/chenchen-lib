/**
 * 发布模块 API — 持久化作者发布配置（本地 JSON）
 * TODO: 同步至读者端、支付、结算
 */

import { isAddress } from "viem";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { enqueueAiReflowJob } from "@/lib/server/ai-reflow-queue";
import { paidMemberForbiddenResponse } from "@/lib/server/paid-membership";
import {
  readPublishRecordFs,
  safeNovelSegment,
  writePublishRecordFs,
} from "@/lib/server/publish-record-fs";
import { trackWalletEvent } from "@/lib/server/wallet-analytics";
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

/** 仅允许指向本站 audio-host、且 path 第一段为当前作者地址的链接 */
function isAllowedNarrationAudioUrl(urlStr: string, authorLower: string): boolean {
  const trimmed = urlStr.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }
  if (!/\/api\/v1\/audio-host$/i.test(u.pathname.replace(/\/+$/, ""))) return false;
  const pathParam = u.searchParams.get("path")?.trim() ?? "";
  const parts = pathParam.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  if (parts[0].toLowerCase() !== authorLower) return false;
  const safeSeg = /^[a-zA-Z0-9_.-]+$/;
  if (!parts.every((p) => safeSeg.test(p))) return false;
  return true;
}

function structureFilePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "structure",
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

async function readStructureChapterIds(
  authorLower: string,
  novelId: string,
): Promise<string[]> {
  const fp = structureFilePath(authorLower, novelId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as {
      nodes?: Array<{ id?: unknown; kind?: unknown }>;
    };
    return (parsed.nodes ?? [])
      .filter((n) => n?.kind === "chapter" && typeof n?.id === "string")
      .map((n) => String(n.id).trim())
      .filter(Boolean)
      .slice(0, 2000);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
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
    const record = await readPublishRecordFs(wh.walletLower, novelId);
    return NextResponse.json({ record });
  }

  const novels = await readAuthorNovelList(wh.walletLower);
  const items = await Promise.all(
    novels.map(async (n) => {
      const record = await readPublishRecordFs(wh.walletLower, n.id);
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

function parseChapterIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function normalizeLayoutMode(raw: unknown): "preserve" | "ai_reflow" {
  return raw === "ai_reflow" ? "ai_reflow" : "preserve";
}

function normalizeFirstLineIndent(raw: unknown): boolean {
  return raw === true;
}

/** 取消/覆盖上一波后台排版任务，避免旧任务写回覆盖新配置 */
function invalidateAiReflowFields(rec: NovelPublishRecord): NovelPublishRecord {
  return {
    ...rec,
    aiReflowGeneration: (rec.aiReflowGeneration ?? 0) + 1,
    aiReflowStatus: undefined,
    aiReflowError: undefined,
    aiReflowStartedAt: undefined,
    aiReflowFinishedAt: undefined,
  };
}

function withPendingAiReflow(
  rec: NovelPublishRecord,
  chapterIds: string[],
): { record: NovelPublishRecord; generation: number; queued: boolean } {
  if (chapterIds.length === 0) {
    return { record: rec, generation: rec.aiReflowGeneration ?? 0, queued: false };
  }
  const generation = (rec.aiReflowGeneration ?? 0) + 1;
  return {
    record: {
      ...rec,
      aiReflowGeneration: generation,
      aiReflowStatus: "pending",
      aiReflowError: undefined,
      aiReflowStartedAt: new Date().toISOString(),
      aiReflowFinishedAt: undefined,
    },
    generation,
    queued: true,
  };
}

async function markAiReflowEnqueueFailed(params: {
  authorLower: string;
  novelId: string;
  expectedGeneration: number;
  message: string;
}) {
  const { authorLower, novelId, expectedGeneration, message } = params;
  const cur = await readPublishRecordFs(authorLower, novelId);
  if (!cur || (cur.aiReflowGeneration ?? 0) !== expectedGeneration) return;
  if (cur.aiReflowStatus !== "pending") return;
  await writePublishRecordFs({
    ...cur,
    aiReflowStatus: "error",
    aiReflowError: message.slice(0, 500),
    aiReflowFinishedAt: new Date().toISOString(),
  });
}

async function enqueueAiReflowOrFail(params: {
  authorLower: string;
  novelId: string;
  chapterIds: string[];
  expectedGeneration: number;
}) {
  try {
    await enqueueAiReflowJob(params);
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "排版任务入队失败（请确认 Redis 已启动且 REDIS_URL 正确，并已运行 worker）";
    await markAiReflowEnqueueFailed({
      authorLower: params.authorLower,
      novelId: params.novelId,
      expectedGeneration: params.expectedGeneration,
      message: msg,
    });
    throw e;
  }
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
  const currentNovel = novels.find((n) => n.id === novelId);
  if (!currentNovel) {
    return NextResponse.json({ error: "未找到该小说" }, { status: 404 });
  }

  const action = o.action === "withdraw" ? "withdraw" : "publish";

  if (o.action === "set_chapter_narration_audio") {
    const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
    if (!chapterId) return badRequest("Missing chapterId");
    const existing = await readPublishRecordFs(wh.walletLower, novelId);
    if (!existing) {
      return badRequest("请先完成整本发布配置，再关联章节朗读");
    }
    const rawUrl = o.audioUrl;
    const map: Record<string, string> = {
      ...(existing.chapterNarrationAudio && typeof existing.chapterNarrationAudio === "object"
        ? existing.chapterNarrationAudio
        : {}),
    };
    if (rawUrl === null || rawUrl === "") {
      delete map[chapterId];
    } else if (typeof rawUrl === "string") {
      const u = rawUrl.trim();
      if (!isAllowedNarrationAudioUrl(u, wh.walletLower)) {
        return badRequest("无效的音频地址（仅支持本站上由你账号上传的音频链接）");
      }
      map[chapterId] = u;
    } else {
      return badRequest("Invalid audioUrl");
    }
    const next: NovelPublishRecord = {
      ...existing,
      chapterNarrationAudio: Object.keys(map).length > 0 ? map : undefined,
    };
    await writePublishRecordFs(next);
    try {
      await trackWalletEvent({
        wallet: wh.walletLower,
        eventType: "publish_change",
        meta: { novelId },
      });
    } catch {
      // ignore
    }
    return NextResponse.json({ record: next, ok: true });
  }

  if (o.action === "set_reader_style") {
    const existing = await readPublishRecordFs(wh.walletLower, novelId);
    if (!existing) {
      return badRequest("请先保存发布配置，再设置段落样式");
    }
    const firstLineIndent = normalizeFirstLineIndent(o.firstLineIndent);
    const next: NovelPublishRecord = {
      ...existing,
      firstLineIndent,
    };
    await writePublishRecordFs(next);
    try {
      await trackWalletEvent({
        wallet: wh.walletLower,
        eventType: "publish_change",
        meta: { novelId },
      });
    } catch {
      // ignore analytics error
    }
    return NextResponse.json({ record: next, ok: true });
  }

  if (o.action === "toggle_chapter") {
    const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
    if (!chapterId) return badRequest("Missing chapterId");
    const publish = o.publish !== false;

    const existing = await readPublishRecordFs(wh.walletLower, novelId);
    if (!existing) {
      return badRequest("请先完成整本发布配置，再按章节发布");
    }
    if (existing.visibility !== "public") {
      return badRequest("当前作品未公开，无法按章节发布");
    }

    const layoutMode = normalizeLayoutMode(o.layoutMode ?? existing.layoutMode);
    const firstLineIndent = normalizeFirstLineIndent(
      o.firstLineIndent ?? existing.firstLineIndent,
    );

    const current = new Set(parseChapterIds(existing.publishedChapterIds));
    if (publish) {
      current.add(chapterId);
    } else {
      current.delete(chapterId);
    }

    let next: NovelPublishRecord = {
      ...existing,
      publishedChapterIds: Array.from(current),
      layoutMode,
      firstLineIndent,
      publishedAt: existing.publishedAt || new Date().toISOString(),
    };
    let aiReflowQueued = false;
    let reflowGeneration = next.aiReflowGeneration ?? 0;

    if (publish && layoutMode === "ai_reflow") {
      const deny = await paidMemberForbiddenResponse(wh.walletLower);
      if (deny) return deny;
      const p = withPendingAiReflow(next, [chapterId]);
      next = p.record;
      reflowGeneration = p.generation;
      aiReflowQueued = p.queued;
    } else {
      next = invalidateAiReflowFields(next);
    }

    await writePublishRecordFs(next);
    if (aiReflowQueued) {
      try {
        await enqueueAiReflowOrFail({
          authorLower: wh.walletLower,
          novelId,
          chapterIds: [chapterId],
          expectedGeneration: reflowGeneration,
        });
      } catch (e) {
        const fresh = await readPublishRecordFs(wh.walletLower, novelId);
        return NextResponse.json(
          {
            ok: false,
            aiReflowQueued: false,
            record: fresh ?? next,
            error:
              e instanceof Error
                ? e.message
                : "AI 排版任务入队失败（请检查 Redis 是否启动、REDIS_URL 是否正确，以及是否运行 worker）",
          },
          { status: 503 },
        );
      }
    }
    try {
      await trackWalletEvent({
        wallet: wh.walletLower,
        eventType: "publish_change",
        meta: { novelId },
      });
    } catch {
      // ignore analytics error
    }
    return NextResponse.json({ record: next, ok: true, aiReflowQueued });
  }

  if (o.action === "publish_all_chapters") {
    const clientChapterIds = parseChapterIds(o.allChapterIds);
    if (clientChapterIds.length === 0) {
      return badRequest("Missing allChapterIds");
    }
    const existing = await readPublishRecordFs(wh.walletLower, novelId);
    if (!existing) {
      return badRequest("请先完成整本发布配置，再按章节发布");
    }
    const layoutMode = normalizeLayoutMode(o.layoutMode ?? existing.layoutMode);
    const firstLineIndent = normalizeFirstLineIndent(
      o.firstLineIndent ?? existing.firstLineIndent,
    );
    if (existing.visibility !== "public") {
      return badRequest("当前作品未公开，无法发布章节");
    }
    const structureChapterIds = await readStructureChapterIds(wh.walletLower, novelId);
    // 若客户端传入的章节列表明显偏少，优先以服务端结构文件为准，避免“只发布了 1 章”。
    const allChapterIds =
      structureChapterIds.length > clientChapterIds.length
        ? structureChapterIds
        : clientChapterIds;

    let next: NovelPublishRecord = {
      ...existing,
      publishedChapterIds: allChapterIds,
      layoutMode,
      firstLineIndent,
      publishedAt: existing.publishedAt || new Date().toISOString(),
    };
    let aiReflowQueued = false;
    let reflowGeneration = next.aiReflowGeneration ?? 0;

    if (layoutMode === "ai_reflow") {
      const deny = await paidMemberForbiddenResponse(wh.walletLower);
      if (deny) return deny;
      const p = withPendingAiReflow(next, allChapterIds);
      next = p.record;
      reflowGeneration = p.generation;
      aiReflowQueued = p.queued;
    } else {
      next = invalidateAiReflowFields(next);
    }

    await writePublishRecordFs(next);
    if (aiReflowQueued) {
      try {
        await enqueueAiReflowOrFail({
          authorLower: wh.walletLower,
          novelId,
          chapterIds: allChapterIds,
          expectedGeneration: reflowGeneration,
        });
      } catch (e) {
        const fresh = await readPublishRecordFs(wh.walletLower, novelId);
        return NextResponse.json(
          {
            ok: false,
            aiReflowQueued: false,
            record: fresh ?? next,
            error:
              e instanceof Error
                ? e.message
                : "AI 排版任务入队失败（请检查 Redis 是否启动、REDIS_URL 是否正确，以及是否运行 worker）",
          },
          { status: 503 },
        );
      }
    }
    try {
      await trackWalletEvent({
        wallet: wh.walletLower,
        eventType: "publish_change",
        meta: { novelId },
      });
    } catch {
      // ignore analytics error
    }
    return NextResponse.json({ record: next, ok: true, aiReflowQueued });
  }

  if (action === "withdraw") {
    const existing = await readPublishRecordFs(wh.walletLower, novelId);
    if (!existing) {
      return badRequest("无可撤回的配置");
    }
    if (existing.visibility !== "public" || existing.paymentMode !== "free") {
      return badRequest(
        "仅「已公开 · 免费阅读」作品支持撤回至草稿；付费连载请通过客服处理。",
      );
    }
    let next: NovelPublishRecord = {
      ...existing,
      visibility: "private",
      paymentMode: "free",
      priceAmount: "",
      currency: "HKD",
      withdrawnAt: new Date().toISOString(),
      publishedAt: existing.publishedAt,
      articleId: existing.articleId,
    };
    next = invalidateAiReflowFields(next);
    await writePublishRecordFs(next);
    try {
      await trackWalletEvent({
        wallet: wh.walletLower,
        eventType: "publish_change",
        meta: { novelId },
      });
    } catch {
      // ignore analytics error
    }
    return NextResponse.json({ record: next, ok: true });
  }

  const title = currentNovel.title.trim().slice(0, 300);
  if (!title) return badRequest("小说标题为空，请先在小说设置中填写标题");
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
  const allChapterIds = parseChapterIds(o.allChapterIds);
  const layoutMode = normalizeLayoutMode(o.layoutMode);

  const existing = await readPublishRecordFs(wh.walletLower, novelId);
  const firstLineIndent = normalizeFirstLineIndent(
    o.firstLineIndent ?? existing?.firstLineIndent,
  );
  const articleId = existing?.articleId ?? (await allocateArticleId());
  const publishedChapterIds =
    parseChapterIds(existing?.publishedChapterIds).length > 0
      ? parseChapterIds(existing?.publishedChapterIds)
      : allChapterIds;

  const recordBase: NovelPublishRecord = {
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
    publishedChapterIds,
    layoutMode,
    firstLineIndent,
    publishedAt: new Date().toISOString(),
    withdrawnAt: null,
    chapterNarrationAudio: existing?.chapterNarrationAudio,
  };

  const needsAsyncReflow =
    visibility === "public" && layoutMode === "ai_reflow" && allChapterIds.length > 0;

  if (needsAsyncReflow) {
    const deny = await paidMemberForbiddenResponse(wh.walletLower);
    if (deny) return deny;
  }

  let record: NovelPublishRecord;
  let aiReflowQueued = false;
  let reflowGeneration = recordBase.aiReflowGeneration ?? 0;

  if (needsAsyncReflow) {
    const p = withPendingAiReflow(recordBase, allChapterIds);
    record = p.record;
    reflowGeneration = p.generation;
    aiReflowQueued = p.queued;
  } else {
    record = invalidateAiReflowFields(recordBase);
  }

  await writePublishRecordFs(record);
  if (aiReflowQueued) {
    try {
      await enqueueAiReflowOrFail({
        authorLower: wh.walletLower,
        novelId,
        chapterIds: allChapterIds,
        expectedGeneration: reflowGeneration,
      });
    } catch (e) {
      const fresh = await readPublishRecordFs(wh.walletLower, novelId);
      return NextResponse.json(
        {
          ok: false,
          aiReflowQueued: false,
          record: fresh ?? record,
          error:
            e instanceof Error
              ? e.message
              : "AI 排版任务入队失败（请检查 Redis 是否启动、REDIS_URL 是否正确，以及是否运行 worker）",
        },
        { status: 503 },
      );
    }
  }
  try {
    await trackWalletEvent({
      wallet: wh.walletLower,
      eventType: "publish_change",
      meta: { novelId },
    });
  } catch {
    // ignore analytics error
  }
  return NextResponse.json({ record, ok: true, aiReflowQueued });
}
