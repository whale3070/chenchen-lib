import fs from "node:fs/promises";
import path from "node:path";

export type WalletEventType =
  | "save_draft"
  | "publish_change"
  | "translate"
  | "reader_unlock";

export type WalletEvent = {
  /** Author identity: real wallet (MetaMask) or synthetic 0x id for email accounts */
  wallet: string;
  eventType: WalletEventType | string;
  ts: string;
  meta?: {
    novelId?: string;
    articleId?: string;
  };
};

const ANALYTICS_DIR = path.join(
  process.cwd(),
  ".data",
  "analytics",
  "wallet-events",
);

function dayKeyByTz(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function dayFilePath(day: string): string {
  return path.join(ANALYTICS_DIR, `${day}.jsonl`);
}

function coerceIso(input?: string): string {
  if (!input) return new Date().toISOString();
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export async function trackWalletEvent(payload: {
  /** Real wallet or email-account synthetic address (both are 0x author ids on the server). */
  wallet: string;
  eventType: WalletEventType | string;
  ts?: string;
  meta?: WalletEvent["meta"];
}) {
  const wallet = payload.wallet.trim().toLowerCase();
  if (!wallet || !wallet.startsWith("0x")) return;
  const ts = coerceIso(payload.ts);
  const day = dayKeyByTz(new Date(ts), "Asia/Shanghai");
  const record: WalletEvent = {
    wallet,
    eventType: payload.eventType,
    ts,
    ...(payload.meta ? { meta: payload.meta } : {}),
  };
  await fs.mkdir(ANALYTICS_DIR, { recursive: true });
  await fs.appendFile(dayFilePath(day), `${JSON.stringify(record)}\n`, "utf8");
}

export async function readWalletEventsForDays(days: string[]): Promise<WalletEvent[]> {
  const out: WalletEvent[] = [];
  for (const day of days) {
    const fp = dayFilePath(day);
    let raw = "";
    try {
      raw = await fs.readFile(fp, "utf8");
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? (e as NodeJS.ErrnoException).code
          : undefined;
      if (code === "ENOENT") continue;
      throw e;
    }
    const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<WalletEvent>;
        if (
          typeof parsed.wallet === "string" &&
          typeof parsed.eventType === "string" &&
          typeof parsed.ts === "string"
        ) {
          out.push({
            wallet: parsed.wallet.toLowerCase(),
            eventType: parsed.eventType,
            ts: parsed.ts,
            ...(parsed.meta && typeof parsed.meta === "object"
              ? { meta: parsed.meta }
              : {}),
          });
        }
      } catch {
        // ignore broken line
      }
    }
  }
  return out;
}

export function listRecentDays(params: { days: number; timeZone?: string; now?: Date }) {
  const total = Math.max(1, Math.min(366, Math.floor(params.days)));
  const tz = params.timeZone || "Asia/Shanghai";
  const now = params.now ?? new Date();
  const out: string[] = [];
  for (let i = total - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(dayKeyByTz(d, tz));
  }
  return out;
}

export function computeActiveUserAnalytics(params: {
  days: string[];
  events: WalletEvent[];
  timeZone: string;
  rangeLabel: string;
}): {
  range: string;
  tz: string;
  summary: { dau: number; wau: number; mau: number };
  series: Array<{ date: string; activeUsers: number }>;
  byEventType: Array<{ eventType: string; users: number; events: number }>;
} {
  const { days, events, timeZone: tz, rangeLabel } = params;
  const byDayUsers = new Map<string, Set<string>>();
  const byEventType = new Map<string, { users: Set<string>; events: number }>();

  for (const day of days) {
    byDayUsers.set(day, new Set<string>());
  }

  for (const ev of events) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ev.ts));
    const set = byDayUsers.get(day);
    if (set) set.add(ev.wallet);

    const stat = byEventType.get(ev.eventType) ?? {
      users: new Set<string>(),
      events: 0,
    };
    stat.users.add(ev.wallet);
    stat.events += 1;
    byEventType.set(ev.eventType, stat);
  }

  const today = days[days.length - 1];
  const last7Days = days.slice(Math.max(0, days.length - 7));
  const last30Days = days.slice(Math.max(0, days.length - 30));

  const dau = byDayUsers.get(today)?.size ?? 0;
  const wauSet = new Set<string>();
  for (const day of last7Days) {
    for (const uid of byDayUsers.get(day) ?? []) wauSet.add(uid);
  }
  const mauSet = new Set<string>();
  for (const day of last30Days) {
    for (const uid of byDayUsers.get(day) ?? []) mauSet.add(uid);
  }

  const series = days.map((day) => ({
    date: day,
    activeUsers: byDayUsers.get(day)?.size ?? 0,
  }));

  const byEventTypeSummary = Array.from(byEventType.entries())
    .map(([eventType, stat]) => ({
      eventType,
      users: stat.users.size,
      events: stat.events,
    }))
    .sort((a, b) => b.events - a.events);

  return {
    range: rangeLabel,
    tz,
    summary: {
      dau,
      wau: wauSet.size,
      mau: mauSet.size,
    },
    series,
    byEventType: byEventTypeSummary,
  };
}
