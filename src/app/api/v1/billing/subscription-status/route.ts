import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import {
  isPaidMemberRecordActive,
  readPaidMemberRecord,
} from "@/lib/server/paid-membership";

export const runtime = "nodejs";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function parseWallet(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const addr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(addr)) return { ok: false, res: unauthorized("缺少或无效的登录身份（x-wallet-address）") };
  return { ok: true, walletLower: addr.toLowerCase() };
}

/** 当前作者在本地持久化的 VIP / Stripe 订阅同步状态摘要 */
export async function GET(req: NextRequest) {
  const wh = parseWallet(req);
  if (!wh.ok) return wh.res;

  const rec = await readPaidMemberRecord(wh.walletLower);

  return NextResponse.json({
    subscriptionActive: isPaidMemberRecordActive(rec),
    status: rec?.status ?? null,
    currentPeriodEnd: rec?.currentPeriodEnd ?? null,
    stripeCustomerId: rec?.stripeCustomerId ?? null,
    stripeSubscriptionId: rec?.stripeSubscriptionId ?? null,
  });
}
