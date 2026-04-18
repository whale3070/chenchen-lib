import { NextResponse, type NextRequest } from "next/server";

import { buildAuthClearCookie } from "@/lib/auth/cookie";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", buildAuthClearCookie(req));
  return res;
}
