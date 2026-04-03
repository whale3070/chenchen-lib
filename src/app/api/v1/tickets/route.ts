import { isAddress } from "viem";

import { NextResponse, type NextRequest } from "next/server";

import { createTicket, isAdminWallet, listTickets } from "@/lib/server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
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
  const statusRaw = req.nextUrl.searchParams.get("status")?.trim() ?? "";
  const mineOnly = req.nextUrl.searchParams.get("mine") === "1";
  const tickets = await listTickets();
  const items = tickets
    .filter((t) => (isAdmin && !mineOnly ? true : t.createdBy === wh.walletLower))
    .filter((t) =>
      statusRaw
        ? t.status === statusRaw
        : true,
    );
  return NextResponse.json({
    items,
    isAdmin,
  });
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const content = typeof o.content === "string" ? o.content.trim() : "";
  const imageUrls = Array.isArray(o.imageUrls)
    ? o.imageUrls
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  if (!title) return badRequest("请填写工单标题");
  if (!content) return badRequest("请填写工单详情");

  const existing = await listTickets();
  const latest = existing.find((t) => t.createdBy === wh.walletLower);
  if (latest) {
    const latestMs = new Date(latest.createdAt).getTime();
    if (Number.isFinite(latestMs) && Date.now() - latestMs < 30_000) {
      return badRequest("提交过于频繁，请 30 秒后再试");
    }
  }

  const ticket = await createTicket({
    createdBy: wh.walletLower,
    title,
    content,
    imageUrls,
  });
  return NextResponse.json({ ok: true, ticket });
}

