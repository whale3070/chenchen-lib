import { isCharacterArcMaster } from "@/lib/character-arc-validate";
import {
  readCharacterArcMaster,
  scanCastTimelineForStableKey,
  writeCharacterArcMaster,
} from "@/lib/server/character-arc-storage";
import { paidMemberForbiddenResponse } from "@/lib/server/paid-membership";
import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
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

/** 人物主档 + 各章最新版本快照时间线（仅校验钱包） */
export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get("authorId")?.trim() ?? "";
  const novelId = searchParams.get("novelId")?.trim() ?? "";
  const stableId = searchParams.get("stableId")?.trim() ?? "";

  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");
  if (!stableId) return badRequest("Missing stableId");

  const [master, timeline] = await Promise.all([
    readCharacterArcMaster(wh.walletLower, novelId, stableId),
    scanCastTimelineForStableKey(wh.walletLower, novelId, stableId),
  ]);

  const inferredFirst =
    timeline.length > 0
      ? {
          chapterId: timeline[0]!.chapterId,
          chapterIndex: timeline[0]!.chapterIndex,
        }
      : null;

  const displayFromCast =
    timeline.length > 0
      ? {
          name: timeline[0]!.character.name,
          namePinyin: timeline[0]!.character.namePinyin,
          stableId: timeline[0]!.character.stableId.trim(),
        }
      : null;

  return NextResponse.json({
    master,
    timeline,
    inferredFirst,
    displayFromCast,
  });
}

/** 保存人物主档（付费或管理员，与 chapter-cast PUT 一致） */
export async function PUT(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const deny = await paidMemberForbiddenResponse(wh.walletLower);
  if (deny) return deny;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  const payload = o.payload;
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!isCharacterArcMaster(payload)) {
    return badRequest("Invalid character arc payload");
  }

  const next = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  try {
    await writeCharacterArcMaster(wh.walletLower, next.novelId, next);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "写入失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, master: next });
}
