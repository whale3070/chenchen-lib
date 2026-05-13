import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import {
  ensureVersioningRoot,
  readOwnedNovel,
  restoreBranchToCommit,
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
  const commitId = typeof o.commitId === "string" ? o.commitId.trim() : "";
  if (!commitId) return badRequest("Missing commitId");
  const updateHead = o.updateHead !== false;
  await ensureVersioningRoot(workId, wh.walletLower);
  try {
    const commit = await restoreBranchToCommit({
      workId,
      branchId,
      commitId,
      authorId: wh.walletLower,
      updateHead,
    });
    return NextResponse.json({ ok: true, commit });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "branch_not_found") {
      return NextResponse.json({ error: "branch not found" }, { status: 404 });
    }
    if (msg === "commit_not_found") {
      return NextResponse.json({ error: "commit not found" }, { status: 404 });
    }
    if (msg === "snapshot_not_found") {
      return NextResponse.json({ error: "snapshot not found" }, { status: 404 });
    }
    throw e;
  }
}

