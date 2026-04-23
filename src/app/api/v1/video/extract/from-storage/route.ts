import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { VIDEO_EXTRACT_MAX_BYTES } from "@/lib/video-extract-constants";
import {
  deleteVideoExtractObject,
  downloadVideoExtractObjectToFile,
  headVideoExtractObject,
  isVideoExtractS3Configured,
  videoExtractS3MetaPath,
  type VideoExtractS3StagingMeta,
} from "@/lib/video-extract-s3";
import { after, NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

import {
  getPublicBaseUrl,
  isChainedOpusOggUpload,
  pendingExtractAbsPath,
  readIndex,
  runVideoExtractJob,
  writeIndex,
  type VideoExtractItem,
} from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 7200;

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

/** 在浏览器已完成 PUT 上传后，由服务端从桶内拉取到本地 pending 并进入转码队列 */
export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  if (!isVideoExtractS3Configured()) {
    return NextResponse.json({ error: "未配置对象存储" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("请求体须为 JSON：{ uploadId }");
  }
  const uploadId =
    typeof (body as { uploadId?: unknown }).uploadId === "string"
      ? (body as { uploadId: string }).uploadId.trim()
      : "";
  if (!uploadId.startsWith("vs3-")) return badRequest("缺少或无效的 uploadId");

  const metaAbs = videoExtractS3MetaPath(wh.walletLower, uploadId);
  let metaRaw: string;
  try {
    metaRaw = await fs.readFile(metaAbs, "utf8");
  } catch {
    return NextResponse.json({ error: "未找到预上传会话或已失效" }, { status: 404 });
  }

  let meta: VideoExtractS3StagingMeta;
  try {
    meta = JSON.parse(metaRaw) as VideoExtractS3StagingMeta;
  } catch {
    return NextResponse.json({ error: "会话元数据损坏" }, { status: 500 });
  }

  if (meta.authorLower !== wh.walletLower) {
    return unauthorized("无权提交该会话");
  }
  if (meta.totalSize > VIDEO_EXTRACT_MAX_BYTES) {
    return badRequest(`文件过大（>${VIDEO_EXTRACT_MAX_BYTES / (1024 * 1024)}MB）`);
  }

  let head: { contentLength: number };
  try {
    head = await headVideoExtractObject(meta.key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return badRequest(`对象尚未就绪或不存在：${msg}`);
  }

  if (head.contentLength !== meta.totalSize) {
    return badRequest(
      `对象大小 ${head.contentLength} 与声明的 ${meta.totalSize} 不一致，请确认 PUT 已完整上传后再提交`,
    );
  }

  const now = new Date().toISOString();
  const id = `vex-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const month = now.slice(0, 7).replace("-", "");
  const publicBase = getPublicBaseUrl(req);

  const pendingFileName = `${id}${meta.ext}`;
  const pendingDir = path.join(process.cwd(), ".data", "video-extract-pending", wh.walletLower);
  await fs.mkdir(pendingDir, { recursive: true });
  const pendingAbs = pendingExtractAbsPath(wh.walletLower, pendingFileName);

  try {
    await downloadVideoExtractObjectToFile(meta.key, pendingAbs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fs.unlink(pendingAbs).catch(() => undefined);
    return NextResponse.json({ error: `拉取对象失败：${msg}` }, { status: 500 });
  }

  const st = await fs.stat(pendingAbs);
  if (st.size !== meta.totalSize) {
    await fs.unlink(pendingAbs).catch(() => undefined);
    return badRequest("落盘大小与预期不一致");
  }

  const assembled = await fs.readFile(pendingAbs);
  if (isChainedOpusOggUpload(assembled, meta.ext)) {
    await fs.unlink(pendingAbs).catch(() => undefined);
    await fs.unlink(metaAbs).catch(() => undefined);
    try {
      await deleteVideoExtractObject(meta.key);
    } catch {
      /* 清理失败不阻塞错误返回 */
    }
    return badRequest(
      "检测到链式 Ogg/Opus（多个 OpusHead）；请导出为单一流、转 WAV 或分段上传。",
    );
  }

  const item: VideoExtractItem = {
    id,
    sourceName: meta.displaySourceName,
    mp3Url: "",
    pathParam: "",
    size: meta.totalSize,
    sourceSize: meta.totalSize,
    createdAt: now,
    status: "processing",
    pendingFileName,
  };
  const index = await readIndex(wh.walletLower);
  index.items.unshift(item);
  await writeIndex(index);

  await fs.unlink(metaAbs).catch(() => undefined);

  try {
    await deleteVideoExtractObject(meta.key);
  } catch (e) {
    console.error("[video/extract/from-storage] delete staging object:", e);
  }

  after(() => {
    void runVideoExtractJob({
      authorLower: wh.walletLower,
      id,
      ext: meta.ext,
      publicBase,
      month,
      pendingAbs,
    });
  });

  return NextResponse.json({ item, asyncAccepted: true });
}
