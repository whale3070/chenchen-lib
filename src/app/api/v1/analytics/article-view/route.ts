import { NextResponse, type NextRequest } from "next/server";

import {
  getClientIpFromRequest,
  hashIpForArticleUv,
  isKnownPublishedArticleId,
  isValidArticleIdFormat,
  normalizeArticleId,
  recordArticleUvIfNew,
} from "@/lib/server/article-uv-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("无效 JSON");
  }
  if (!body || typeof body !== "object") {
    return badRequest("请求体无效");
  }
  const articleIdRaw = (body as { articleId?: unknown }).articleId;
  if (typeof articleIdRaw !== "string" || !articleIdRaw.trim()) {
    return badRequest("缺少 articleId");
  }
  const articleId = normalizeArticleId(articleIdRaw);
  if (!isValidArticleIdFormat(articleId)) {
    return badRequest("articleId 格式无效");
  }
  const known = await isKnownPublishedArticleId(articleId);
  if (!known) {
    return NextResponse.json({ ok: true, ignored: true, reason: "unknown_article" });
  }
  const ip = getClientIpFromRequest(req);
  const ipHash = hashIpForArticleUv(ip);
  const { recorded } = await recordArticleUvIfNew({ articleId, ipHash });
  return NextResponse.json({ ok: true, recorded });
}
