import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import {
  createCommitFromLive,
  ensureVersioningRoot,
  listCommits,
  readBranch,
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workId: string; branchId: string }> },
) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const { workId, branchId } = await params;
  const novel = await readOwnedNovel(wh.walletLower, workId);
  if (!novel) return forbidden("该作品不存在或不属于当前作者");
  await ensureVersioningRoot(workId, wh.walletLower);
  const branch = await readBranch(workId, branchId);
  if (!branch) return NextResponse.json({ error: "branch not found" }, { status: 404 });
  const commits = await listCommits(workId, branchId);
  return NextResponse.json({ branch, commits });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workId: string; branchId: string }> },
) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const { workId, branchId } = await params;
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
  const message = typeof o.message === "string" ? o.message.trim() : "";
  if (message.length < 2 || message.length > 200) {
    return badRequest("message 长度需在 2-200 之间");
  }
  await ensureVersioningRoot(workId, wh.walletLower);
  try {
    const commit = await createCommitFromLive({
      workId,
      branchId,
      authorId: wh.walletLower,
      message,
      commitType: "manual",
    });
    return NextResponse.json({ commit }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "branch_not_found") {
      return NextResponse.json({ error: "branch not found" }, { status: 404 });
    }
    throw e;
  }
}

