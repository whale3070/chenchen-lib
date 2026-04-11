import { isChapterCastFilePayload } from "@/lib/chapter-cast-validate";
import {
  listChapterCastVersions,
  readChapterCastVersionFiles,
  writeChapterCastFile,
} from "@/lib/server/chapter-cast-storage";
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

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
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

function pickVersion(versions: string[], requested: string | null): string | null {
  if (versions.length === 0) return null;
  if (requested && /^v\d+$/.test(requested) && versions.includes(requested)) {
    return requested;
  }
  return versions[versions.length - 1] ?? null;
}

/** 列出本章已抽取的 JSON（不校验付费，仅校验钱包与 authorId 一致） */
export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get("authorId")?.trim() ?? "";
  const novelId = searchParams.get("novelId")?.trim() ?? "";
  const chapterId = searchParams.get("chapterId")?.trim() ?? "";
  const versionQ = searchParams.get("version")?.trim() ?? "";

  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");
  if (!chapterId) return badRequest("Missing chapterId");

  const versions = await listChapterCastVersions(wh.walletLower, novelId, chapterId);
  const version = pickVersion(versions, versionQ || null);
  const files =
    version === null
      ? []
      : await readChapterCastVersionFiles(wh.walletLower, novelId, chapterId, version);

  return NextResponse.json({ versions, version, files });
}

/** 覆盖保存单个人物 JSON（付费或管理员，与抽取一致） */
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
  const novelId = typeof o.novelId === "string" ? o.novelId.trim() : "";
  const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
  const versionDir = typeof o.version === "string" ? o.version.trim() : "";
  const fileName = typeof o.fileName === "string" ? o.fileName.trim() : "";
  const payload = o.payload;

  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");
  if (!chapterId) return badRequest("Missing chapterId");
  if (!/^v\d+$/.test(versionDir)) return badRequest("Invalid version");
  if (!/^chapter\d+_[a-z0-9_]+\.json$/i.test(fileName)) {
    return badRequest("Invalid fileName");
  }
  if (!isChapterCastFilePayload(payload)) {
    return badRequest("Invalid payload");
  }
  if (payload.novelId !== novelId || payload.chapterId !== chapterId) {
    return badRequest("payload.novelId / chapterId 须与请求一致");
  }
  if (payload.extractVersion !== versionDir) {
    return badRequest("payload.extractVersion 须与 version 一致");
  }

  const versions = await listChapterCastVersions(wh.walletLower, novelId, chapterId);
  if (!versions.includes(versionDir)) {
    return notFound("该版本目录不存在");
  }

  const existing = await readChapterCastVersionFiles(
    wh.walletLower,
    novelId,
    chapterId,
    versionDir,
  );
  if (!existing.some((f) => f.fileName === fileName)) {
    return notFound("文件不存在，无法覆盖保存");
  }

  try {
    await writeChapterCastFile(
      wh.walletLower,
      novelId,
      chapterId,
      versionDir,
      fileName,
      payload,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "写入失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
