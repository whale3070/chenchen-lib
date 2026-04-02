import { NextResponse, type NextRequest } from "next/server";

import {
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

  const byDayWallets = new Map<string, Set<string>>();
  const byEventType = new Map<string, { wallets: Set<string>; events: number }>();

  for (const day of days) {
    byDayWallets.set(day, new Set<string>());
  }

  for (const ev of events) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ev.ts));
    const set = byDayWallets.get(day);
    if (set) set.add(ev.wallet);

    const stat = byEventType.get(ev.eventType) ?? {
      wallets: new Set<string>(),
      events: 0,
    };
    stat.wallets.add(ev.wallet);
    stat.events += 1;
    byEventType.set(ev.eventType, stat);
  }

  const today = days[days.length - 1];
  const last7Days = days.slice(Math.max(0, days.length - 7));
  const last30Days = days.slice(Math.max(0, days.length - 30));

  const dau = byDayWallets.get(today)?.size ?? 0;
  const wauSet = new Set<string>();
  for (const day of last7Days) {
    for (const wallet of byDayWallets.get(day) ?? []) wauSet.add(wallet);
  }
  const mauSet = new Set<string>();
  for (const day of last30Days) {
    for (const wallet of byDayWallets.get(day) ?? []) mauSet.add(wallet);
  }

  const series = days.map((day) => ({
    date: day,
    activeWallets: byDayWallets.get(day)?.size ?? 0,
  }));

  const byEventTypeSummary = Array.from(byEventType.entries())
    .map(([eventType, stat]) => ({
      eventType,
      wallets: stat.wallets.size,
      events: stat.events,
    }))
    .sort((a, b) => b.events - a.events);

  return NextResponse.json({
    range: `${rangeDays}d`,
    tz,
    summary: {
      dau,
      wau: wauSet.size,
      mau: mauSet.size,
    },
    series,
    byEventType: byEventTypeSummary,
    generatedAt: new Date().toISOString(),
  });
}

