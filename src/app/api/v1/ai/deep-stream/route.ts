import { isAddress } from "viem";

import { paidMemberForbiddenResponse } from "@/lib/server/paid-membership";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function resolveAiServiceBase(): string {
  const u =
    process.env.AI_SERVICE_URL?.trim() ||
    process.env.NEXT_PUBLIC_AI_SERVICE_URL?.trim() ||
    "http://127.0.0.1:8787";
  return u.replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return unauthorized("缺少或无效的 x-wallet-address");
  }
  const walletLower = safeAuthorId(headerAddr);

  const deny = await paidMemberForbiddenResponse(walletLower);
  if (deny) return deny;

  const body = await req.text();
  const base = resolveAiServiceBase();
  const res = await fetch(`${base}/v1/mirofish/deep-stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-User-Id": walletLower,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    return new NextResponse(errText, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
    });
  }

  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
