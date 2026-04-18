import { isAddress } from "viem";
import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { verifyAuthToken } from "@/lib/auth/jwt";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const raw = req.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
  if (!raw) {
    return NextResponse.json({ authorId: null, email: null });
  }
  const session = await verifyAuthToken(raw);
  if (!session || !isAddress(session.sub)) {
    return NextResponse.json({ authorId: null, email: null });
  }
  return NextResponse.json({
    authorId: session.sub,
    email: session.email,
  });
}
