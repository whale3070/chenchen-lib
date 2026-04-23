import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

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

type ChunkMeta = {
  authorLower: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const uploadId = req.headers.get("x-chunk-upload-id")?.trim() ?? "";
  const idxRaw = req.headers.get("x-chunk-index")?.trim() ?? "";
  const chunkLenHdr = req.headers.get("x-chunk-byte-length")?.trim() ?? "";
  const chunkIndex = Number(idxRaw);
  const declaredChunkLen = Number(chunkLenHdr);

  if (!uploadId.startsWith("vck-")) return badRequest("缺少或无效的 x-chunk-upload-id");
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return badRequest("缺少或无效的 x-chunk-index");

  const metaPath = path.join(sessionRoot(wh.walletLower, uploadId), "meta.json");
  let metaRaw: string;
  try {
    metaRaw = await fs.readFile(metaPath, "utf8");
  } catch {
    return NextResponse.json({ error: "上传会话不存在或已失效" }, { status: 404 });
  }

  let meta: ChunkMeta;
  try {
    meta = JSON.parse(metaRaw) as ChunkMeta;
  } catch {
    return NextResponse.json({ error: "会话元数据损坏" }, { status: 500 });
  }

  if (meta.authorLower !== wh.walletLower) {
    return unauthorized("无权写入该会话");
  }
  if (chunkIndex >= meta.totalChunks) return badRequest("分片序号超出范围");

  const expectedLen = Math.min(meta.chunkSize, meta.totalSize - chunkIndex * meta.chunkSize);
  if (!Number.isInteger(declaredChunkLen) || declaredChunkLen <= 0) {
    return badRequest("缺少或无效的 x-chunk-byte-length");
  }
  if (declaredChunkLen !== expectedLen) {
    return badRequest(`本分片应为 ${expectedLen} 字节，声明为 ${declaredChunkLen}`);
  }

  let buf: ArrayBuffer;
  try {
    buf = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "读取分片请求体失败" }, { status: 500 });
  }
  if (buf.byteLength !== declaredChunkLen) {
    return badRequest(`分片体大小 ${buf.byteLength} 与声明 ${declaredChunkLen} 不一致`);
  }

  const partPath = path.join(
    sessionRoot(wh.walletLower, uploadId),
    "parts",
    String(chunkIndex).padStart(6, "0"),
  );
  await fs.writeFile(partPath, new Uint8Array(buf));

  return NextResponse.json({ ok: true, chunkIndex, received: buf.byteLength });
}
