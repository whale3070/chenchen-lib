import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

import {
  grantPaidMember,
  isAdminWallet,
  isPaidMemberRecordActive,
  listPaidMemberRecords,
  revokePaidMember,
} from "@/lib/server/paid-membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const addr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(addr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: addr.toLowerCase() };
}

export async function GET(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const isAdmin = await isAdminWallet(wh.walletLower);
  if (!isAdmin) {
    return NextResponse.json({ isAdmin: false, items: [] as const });
  }
  const rows = await listPaidMemberRecords();
  const items = rows.map((r) => ({
    address: r.address,
    record: r.record,
    active: isPaidMemberRecordActive(r.record),
  }));
  return NextResponse.json({ isAdmin: true, items });
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  if (!(await isAdminWallet(wh.walletLower))) {
    return forbidden("仅 ADMIN_ADDRESS 可管理会员");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const action = typeof o.action === "string" ? o.action.trim() : "";
  const walletRaw = typeof o.wallet === "string" ? o.wallet.trim() : "";

  if (!isAddress(walletRaw)) {
    return badRequest("无效的钱包地址 wallet");
  }
  const walletLower = walletRaw.toLowerCase();

  if (action === "revoke") {
    const removed = await revokePaidMember(walletLower);
    return NextResponse.json({
      ok: true,
      revoked: removed,
    });
  }

  if (action === "grant") {
    let extendDays = 30;
    if (o.extendDays !== undefined && o.extendDays !== null) {
      if (typeof o.extendDays !== "number" || !Number.isFinite(o.extendDays)) {
        return badRequest("extendDays 须为数字");
      }
      extendDays = Math.floor(o.extendDays);
    }
    try {
      const record = await grantPaidMember({ walletLower, extendDays });
      return NextResponse.json({ ok: true, record });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "invalid_extend_days") {
        return badRequest("extendDays 须在 1～3650 之间");
      }
      if (msg === "invalid_wallet") {
        return badRequest("无效的钱包地址");
      }
      throw e;
    }
  }

  return badRequest('action 须为 "grant" 或 "revoke"');
}
