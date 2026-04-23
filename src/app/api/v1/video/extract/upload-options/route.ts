import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

import { isVideoExtractS3Configured } from "@/lib/video-extract-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
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

/** 告知工作台是否启用「浏览器直传对象存储」路径（仍须钱包头，与列表 API 一致） */
export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  return NextResponse.json({
    directObjectStorage: isVideoExtractS3Configured(),
  });
}
