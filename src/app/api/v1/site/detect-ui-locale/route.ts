import { NextResponse, type NextRequest } from "next/server";

import { normalizeUiLocale } from "@/lib/site-locale";
import { callDeepSeekChat } from "@/lib/server/deepseek-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateBuckets = new Map<string, number[]>();

function getClientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return fwd;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function allowRate(key: string): boolean {
  const now = Date.now();
  const prev = rateBuckets.get(key) ?? [];
  const cut = prev.filter((t) => now - t < RATE_WINDOW_MS);
  if (cut.length >= RATE_MAX) {
    rateBuckets.set(key, cut);
    return false;
  }
  cut.push(now);
  rateBuckets.set(key, cut);
  return true;
}

export async function POST(req: NextRequest) {
  const key = getClientKey(req);
  if (!allowRate(key)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text =
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";
  if (!text || text.length > 500) {
    return NextResponse.json({ error: "Invalid text" }, { status: 400 });
  }

  const system =
    "The user was asked: What is your native language?\n" +
    "Infer ONE BCP-47 locale tag for their answer (e.g. en, zh-CN, zh-TW, zh-HK, es, ja, ko, fr, de, pt, ru, ar, hi, vi, th, id, tr, pl, nl, it).\n" +
    "Use zh-TW for Traditional Chinese (Taiwan/Hong Kong/Macau) when the user says 繁体/繁體/正體/台灣/香港等.\n" +
    "Reply with ONLY the tag, lowercase language subtag, no punctuation, no explanation.";

  try {
    const raw = await callDeepSeekChat([
      { role: "system", content: system },
      { role: "user", content: text },
    ]);
    const tag = raw.split(/\s+/)[0]?.replace(/[^a-zA-Z0-9-]/g, "") ?? "";
    const normalized = normalizeUiLocale(tag);
    if (!normalized) {
      return NextResponse.json({ locale: null });
    }
    return NextResponse.json({ locale: normalized });
  } catch {
    return NextResponse.json({ locale: null });
  }
}
