import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

import {
  isAdminWallet,
  normalizeTicketStatus,
  readTicket,
  updateTicket,
} from "@/lib/server/tickets";

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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;
  const isAdmin = await isAdminWallet(wh.walletLower);
  if (!isAdmin) return forbidden("仅管理员可操作工单状态");

  const { id } = await ctx.params;
  const ticket = await readTicket(id);
  if (!ticket) {
    return NextResponse.json({ error: "工单不存在" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const statusRaw = typeof o.status === "string" ? o.status.trim() : "";
  if (!statusRaw) return badRequest("Missing status");
  const status = normalizeTicketStatus(statusRaw);
  const next = await updateTicket(id, wh.walletLower, {
    status,
    adminNote: typeof o.adminNote === "string" ? o.adminNote : undefined,
  });
  if (!next) {
    return NextResponse.json({ error: "工单不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ticket: next });
}

