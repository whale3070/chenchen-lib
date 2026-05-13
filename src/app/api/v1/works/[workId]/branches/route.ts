import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import {
  createBranch,
  ensureVersioningRoot,
  listBranches,
  readOwnedNovel,
} from "@/lib/server/versioning/store";

export const runtime = "nodejs";

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
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

function validBranchName(x: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(x);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const { workId } = await params;
  const novel = await readOwnedNovel(wh.walletLower, workId);
  if (!novel) return forbidden("该作品不存在或不属于当前作者");
  await ensureVersioningRoot(workId, wh.walletLower);
  const branches = await listBranches(workId);
  return NextResponse.json({
    workId,
    ownerId: wh.walletLower,
    defaultBranchId: "main",
    branches,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const { workId } = await params;
  const novel = await readOwnedNovel(wh.walletLower, workId);
  if (!novel) return forbidden("该作品不存在或不属于当前作者");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().toLowerCase() : "";
  if (!validBranchName(name)) {
    return badRequest("分支名仅支持小写字母、数字、_、-，且长度 1-64");
  }
  const displayName = typeof o.displayName === "string" ? o.displayName : "";
  const description = typeof o.description === "string" ? o.description : "";
  const sourceBranchId =
    typeof o.sourceBranchId === "string" && o.sourceBranchId.trim().length > 0
      ? o.sourceBranchId.trim()
      : "main";
  await ensureVersioningRoot(workId, wh.walletLower);
  try {
    const branch = await createBranch({
      workId,
      ownerId: wh.walletLower,
      name,
      displayName,
      description,
      sourceBranchId,
    });
    return NextResponse.json({ branch }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "source_branch_not_found") {
      return badRequest("sourceBranchId 不存在");
    }
    if (msg === "branch_name_exists") {
      return badRequest("分支名已存在");
    }
    throw e;
  }
}

