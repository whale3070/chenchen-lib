import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

import { VIDEO_EXTRACT_CHUNK_BYTES, VIDEO_EXTRACT_MAX_BYTES } from "@/lib/video-extract-constants";
import {
  inferUploadExtFromName,
  isRawMp3ExtractMedia,
  isSupportedExtractMedia,
} from "@/lib/video-extract-filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function parseWalletHeader(
  req: NextRequest,
): { ok: true; walletLower: string } | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: headerAddr.toLowerCase() };
}

type ChunkSessionMeta = {
  authorLower: string;
  fileName: string;
  displaySourceName: string;
  ext: string;
  mime: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  createdAt: string;
};

function sessionRoot(authorLower: string, uploadId: string) {
  return path.join(process.cwd(), ".data", "video-chunk-sessions", authorLower, uploadId);
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("请求体须为 JSON：{ fileName, totalSize, mime? }");
  }
  if (!body || typeof body !== "object") return badRequest("无效的 JSON");

  const fileName =
    typeof (body as { fileName?: unknown }).fileName === "string"
      ? (body as { fileName: string }).fileName.trim()
      : "";
  const totalSizeRaw = (body as { totalSize?: unknown }).totalSize;
  const totalSize =
    typeof totalSizeRaw === "number" && Number.isFinite(totalSizeRaw)
      ? Math.floor(totalSizeRaw)
      : typeof totalSizeRaw === "string"
        ? Math.floor(Number(totalSizeRaw))
        : NaN;
  const mime =
    typeof (body as { mime?: unknown }).mime === "string"
      ? (body as { mime: string }).mime.trim().slice(0, 200)
      : "application/octet-stream";

  if (!fileName) return badRequest("缺少 fileName");
  if (!Number.isFinite(totalSize) || totalSize <= 0) return badRequest("缺少或无效的 totalSize");
  if (totalSize > VIDEO_EXTRACT_MAX_BYTES) {
    return badRequest(`文件过大（>${VIDEO_EXTRACT_MAX_BYTES / (1024 * 1024)}MB）`);
  }

  if (isRawMp3ExtractMedia(fileName, mime)) {
    return badRequest("MP3 请使用工作台普通上传（单次 POST），无需分片");
  }
  if (!isSupportedExtractMedia(fileName, mime)) {
    return badRequest("不支持的格式；分片上传仅用于需转码的 MP4 / WAV / Opus / Ogg");
  }

  const ext = inferUploadExtFromName(fileName, mime);
  const rawBase =
    path.basename(fileName || "").replace(/[^\w.-]+/g, "_").replace(/\.+$/, "") || "upload";
  const stem = rawBase.replace(/\.[^.]+$/, "") || "upload";
  const displaySourceName = fileName || `${stem}${ext}`;

  const uploadId = `vck-${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
  const chunkSize = VIDEO_EXTRACT_CHUNK_BYTES;
  const totalChunks = Math.ceil(totalSize / chunkSize);

  const root = sessionRoot(wh.walletLower, uploadId);
  await fs.mkdir(path.join(root, "parts"), { recursive: true });

  const meta: ChunkSessionMeta = {
    authorLower: wh.walletLower,
    fileName,
    displaySourceName,
    ext,
    mime,
    totalSize,
    chunkSize,
    totalChunks,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(root, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  return NextResponse.json({
    uploadId,
    chunkSize,
    totalChunks,
    maxBytes: VIDEO_EXTRACT_MAX_BYTES,
  });
}
