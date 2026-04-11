import { isAddress } from "viem";

import {
  ChapterizeHttpError,
  chapterizeNeedsModel,
  chapterizeTextInternal,
  parseChapterizeMode,
} from "@/lib/server/chapterize-internal";
import { paidMemberForbiddenResponse } from "@/lib/server/paid-membership";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const text =
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text
      : "";
  const mode = parseChapterizeMode((body as { mode?: unknown }).mode);

  if (chapterizeNeedsModel(text, mode)) {
    const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
    if (!isAddress(headerAddr)) {
      return unauthorized("使用 AI 切章请先连接钱包，并在请求中携带 x-wallet-address");
    }
    const deny = await paidMemberForbiddenResponse(safeAuthorId(headerAddr));
    if (deny) return deny;
  }

  try {
    const result = await chapterizeTextInternal(text, mode);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ChapterizeHttpError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "切章失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
