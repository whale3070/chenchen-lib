import fs from "node:fs/promises";
import path from "node:path";

export type WalletEventType =
  | "save_draft"
  | "publish_change"
  | "translate"
  | "reader_unlock";

export type WalletEvent = {
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

