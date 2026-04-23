import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { VIDEO_EXTRACT_MAX_BYTES } from "@/lib/video-extract-constants";
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

function sessionRoot(authorLower: string, uploadId: string) {
  return path.join(process.cwd(), ".data", "video-chunk-sessions", authorLower, uploadId);
}

type CommitMeta = {
  authorLower: string;
  displaySourceName: string;
  ext: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
};

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

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
  if (!uploadId.startsWith("vck-")) return badRequest("缺少或无效的 uploadId");

  const root = sessionRoot(wh.walletLower, uploadId);
  const metaPath = path.join(root, "meta.json");
  let metaRaw: string;
  try {
    metaRaw = await fs.readFile(metaPath, "utf8");
  } catch {
    return NextResponse.json({ error: "上传会话不存在或已失效" }, { status: 404 });
  }

  let meta: CommitMeta;
  try {
    meta = JSON.parse(metaRaw) as CommitMeta;
  } catch {
    return NextResponse.json({ error: "会话元数据损坏" }, { status: 500 });
  }

  if (meta.authorLower !== wh.walletLower) {
    return unauthorized("无权提交该会话");
  }
  if (meta.totalSize > VIDEO_EXTRACT_MAX_BYTES) {
    return badRequest(`文件过大（>${VIDEO_EXTRACT_MAX_BYTES / (1024 * 1024)}MB）`);
  }

  const partsDir = path.join(root, "parts");
  let sum = 0;
  for (let i = 0; i < meta.totalChunks; i++) {
    const p = path.join(partsDir, String(i).padStart(6, "0"));
    let st;
    try {
      st = await fs.stat(p);
    } catch {
      return badRequest(`缺少分片 ${i + 1} / ${meta.totalChunks}，请补传后再提交`);
    }
    const expected = Math.min(meta.chunkSize, meta.totalSize - i * meta.chunkSize);
    if (st.size !== expected) {
      return badRequest(`分片 ${i} 大小 ${st.size} 与预期 ${expected} 不符`);
    }
    sum += Number(st.size);
  }
  if (sum !== meta.totalSize) {
    return badRequest("分片总大小与 totalSize 不一致");
  }

  const now = new Date().toISOString();
  const id = `vex-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const month = now.slice(0, 7).replace("-", "");
  const publicBase = getPublicBaseUrl(req);

  const pendingFileName = `${id}${meta.ext}`;
  const pendingDir = path.join(process.cwd(), ".data", "video-extract-pending", wh.walletLower);
  await fs.mkdir(pendingDir, { recursive: true });
  const pendingAbs = pendingExtractAbsPath(wh.walletLower, pendingFileName);

  for (let i = 0; i < meta.totalChunks; i++) {
    const p = path.join(partsDir, String(i).padStart(6, "0"));
    const chunk = await fs.readFile(p);
    if (i === 0) await fs.writeFile(pendingAbs, chunk);
    else await fs.appendFile(pendingAbs, chunk);
  }

  const st = await fs.stat(pendingAbs);
  if (st.size !== meta.totalSize) {
    await fs.unlink(pendingAbs).catch(() => undefined);
    return badRequest("合并后文件大小异常");
  }

  const assembled = await fs.readFile(pendingAbs);
  if (isChainedOpusOggUpload(assembled, meta.ext)) {
    await fs.unlink(pendingAbs).catch(() => undefined);
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
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

  await fs.rm(root, { recursive: true, force: true }).catch((e) => {
    console.error("[video/extract/chunk-commit] cleanup session:", e);
  });

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
