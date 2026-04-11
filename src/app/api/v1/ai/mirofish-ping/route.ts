import { NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveAiServiceBase(): string {
  const u =
    process.env.AI_SERVICE_URL?.trim() ||
    process.env.NEXT_PUBLIC_AI_SERVICE_URL?.trim() ||
    "http://127.0.0.1:8787";
  return u.replace(/\/+$/, "");
}

/** 健康检查，不要求会员（仅探测上游是否可达） */
export async function GET() {
  try {
    const base = resolveAiServiceBase();
    const res = await fetch(`${base}/v1/mirofish/ping`, { cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
