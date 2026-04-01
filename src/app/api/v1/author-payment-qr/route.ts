import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type PaymentQrRecord = {
  authorId: string;
  novelId: string;
  imageDataUrl: string;
  updatedAt: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function parseWalletHeader(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: headerAddr.toLowerCase() };
}

function paymentQrFilePath(authorLower: string, novelId: string) {
  const safeNovel = novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(
    process.cwd(),
    ".data",
    "payment-qr",
    `${authorLower}_${safeNovel}.json`,
  );
}

function validImageDataUrl(x: string) {
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(x);
}

export async function GET(req: NextRequest) {
  const authorId = req.nextUrl.searchParams.get("authorId")?.trim() ?? "";
  const novelId = req.nextUrl.searchParams.get("novelId")?.trim() ?? "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (!novelId) return badRequest("Missing novelId");

  const fp = paymentQrFilePath(authorId.toLowerCase(), novelId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as PaymentQrRecord;
    return NextResponse.json({ record: data });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return NextResponse.json({ record: null });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const b = body as Record<string, unknown>;

  const authorId = typeof b.authorId === "string" ? b.authorId.trim() : "";
  const novelId = typeof b.novelId === "string" ? b.novelId.trim() : "";
  const imageDataUrl = typeof b.imageDataUrl === "string" ? b.imageDataUrl.trim() : "";

  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (authorId.toLowerCase() !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");
  if (!imageDataUrl) return badRequest("Missing imageDataUrl");
  if (!validImageDataUrl(imageDataUrl)) {
    return badRequest("仅支持图片格式（png/jpg/webp/gif）");
  }
  if (imageDataUrl.length > 8 * 1024 * 1024) {
    return badRequest("图片过大，请压缩后再上传");
  }

  const payload: PaymentQrRecord = {
    authorId: authorId.toLowerCase(),
    novelId,
    imageDataUrl,
    updatedAt: new Date().toISOString(),
  };
  const fp = paymentQrFilePath(payload.authorId, novelId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
  return NextResponse.json({ ok: true, record: payload });
}

export async function DELETE(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const authorId = req.nextUrl.searchParams.get("authorId")?.trim() ?? "";
  const novelId = req.nextUrl.searchParams.get("novelId")?.trim() ?? "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (authorId.toLowerCase() !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");

  const fp = paymentQrFilePath(authorId.toLowerCase(), novelId);
  try {
    await fs.unlink(fp);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw e;
  }
  return NextResponse.json({ ok: true });
}
