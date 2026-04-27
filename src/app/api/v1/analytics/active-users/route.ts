import { NextResponse, type NextRequest } from "next/server";

import {
  computeActiveUserAnalytics,
  listRecentDays,
  readWalletEventsForDays,
} from "@/lib/server/wallet-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeRange(raw: string | null): 7 | 30 | 90 {
  if (raw === "7d") return 7;
  if (raw === "90d") return 90;
  return 30;
}

function normalizeTimeZone(raw: string | null) {
  if (!raw) return "Asia/Shanghai";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return "Asia/Shanghai";
  }
}

export async function GET(req: NextRequest) {
  const groupBy = req.nextUrl.searchParams.get("groupBy");
  if (groupBy && groupBy !== "day") {
    return badRequest("groupBy 仅支持 day");
  }

  const rangeLabel = req.nextUrl.searchParams.get("range");
  const rangeDays = normalizeRange(rangeLabel);
  const tz = normalizeTimeZone(req.nextUrl.searchParams.get("tz"));
  const days = listRecentDays({ days: rangeDays, timeZone: tz });
  const events = await readWalletEventsForDays(days);

  const body = computeActiveUserAnalytics({
    days,
    events,
    timeZone: tz,
    rangeLabel: `${rangeDays}d`,
  });

  return NextResponse.json({
    ...body,
    generatedAt: new Date().toISOString(),
  });
}
