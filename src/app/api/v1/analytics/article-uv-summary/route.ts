import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import {
  authorOwnsArticleId,
  countDistinctIpHashesForArticleInDays,
  countTodayUvForArticle,
  isValidArticleIdFormat,
  normalizeArticleId,
  recentDayKeysShanghai,
} from "@/lib/server/article-uv-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function safeAuthorId(id: string) {
  return id.trim().toLowerCase();
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

const MAX_IDS = 64;

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const raw = req.nextUrl.searchParams.get("articleIds")?.trim() ?? "";
  if (!raw) {
    return badRequest("缺少 articleIds（逗号分隔）");
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > MAX_IDS) {
    return badRequest(`articleIds 最多 ${MAX_IDS} 个`);
  }

  const days7 = recentDayKeysShanghai(7);
  const days30 = recentDayKeysShanghai(30);

  type Entry = { uv7: number; uv30: number; today: number };
  const byArticleId: Record<string, Entry> = {};

  for (const p of parts) {
    const aid = normalizeArticleId(p);
    if (!isValidArticleIdFormat(aid)) continue;
    const owns = await authorOwnsArticleId(wh.walletLower, aid);
    if (!owns) continue;
    const [uv7, uv30, today] = await Promise.all([
      countDistinctIpHashesForArticleInDays(aid, days7),
      countDistinctIpHashesForArticleInDays(aid, days30),
      countTodayUvForArticle(aid),
    ]);
    byArticleId[aid] = { uv7, uv30, today };
  }

  return NextResponse.json({ byArticleId, tz: "Asia/Shanghai" });
}
