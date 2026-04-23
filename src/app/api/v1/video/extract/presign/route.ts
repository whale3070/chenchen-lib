import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { VIDEO_EXTRACT_MAX_BYTES } from "@/lib/video-extract-constants";
import {
  inferUploadExtFromName,
  isRawMp3ExtractMedia,
  isSupportedExtractMedia,
} from "@/lib/video-extract-filename";
import {
  isVideoExtractS3Configured,
  presignVideoExtractPut,
  videoExtractS3MetaPath,
  videoExtractS3PutExpiresSec,
  type VideoExtractS3StagingMeta,
} from "@/lib/video-extract-s3";
import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

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

function sanitizeKeySegment(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 200);
}

/** 为「浏览器 PUT 直传桶」签发预签名 URL；完成后请调 POST /from-storage */
export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  if (!isVideoExtractS3Configured()) {
    return NextResponse.json(
      { error: "未配置对象存储", hint: "请设置 VIDEO_EXTRACT_S3_BUCKET 与访问密钥等环境变量。" },
      { status: 503 },
    );
  }

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
    return badRequest("MP3 请使用工作台普通上传，无需对象存储直传");
  }
  if (!isSupportedExtractMedia(fileName, mime)) {
    return badRequest("不支持的格式");
  }

  const ext = inferUploadExtFromName(fileName, mime);
  const rawBase =
    path.basename(fileName || "").replace(/[^\w.-]+/g, "_").replace(/\.+$/, "") || "upload";
  const stem = rawBase.replace(/\.[^.]+$/, "") || "upload";
  const displaySourceName = fileName || `${stem}${ext}`;

  const uploadId = `vs3-${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
  const key = `staging/video-extract/${sanitizeKeySegment(wh.walletLower)}/${uploadId}${ext}`;

  const contentType =
    mime.split(";")[0]?.trim().slice(0, 200) || "application/octet-stream";

  let putUrl: string;
  try {
    putUrl = await presignVideoExtractPut({
      key,
      contentType,
      contentLength: totalSize,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[video/extract/presign]", e);
    return NextResponse.json({ error: `预签名失败：${msg}` }, { status: 500 });
  }

  const meta: VideoExtractS3StagingMeta = {
    authorLower: wh.walletLower,
    uploadId,
    key,
    fileName,
    displaySourceName,
    ext,
    mime: contentType,
    totalSize,
    createdAt: new Date().toISOString(),
  };

  const metaAbs = videoExtractS3MetaPath(wh.walletLower, uploadId);
  await fs.mkdir(path.dirname(metaAbs), { recursive: true });
  await fs.writeFile(metaAbs, JSON.stringify(meta, null, 2), "utf8");

  return NextResponse.json({
    uploadId,
    putUrl,
    method: "PUT",
    contentType,
    expiresIn: videoExtractS3PutExpiresSec(),
    hint:
      "浏览器将向桶域名发起跨域 PUT；请在桶 CORS 中允许本站 Origin、方法 PUT、请求头 Content-Type 与 Content-Length。",
  });
}
