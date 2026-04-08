import { NextResponse, type NextRequest } from "next/server";

import { callDeepSeekChat } from "@/lib/server/deepseek-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 120_000;
const RATE_MAX = 8;
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

function extractJsonObject(raw: string): Record<string, string> | null {
  const code = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const slice = code ? code[1] : raw;
  const tryParse = (s: string): Record<string, string> | null => {
    try {
      const p = JSON.parse(s.trim()) as unknown;
      if (!p || typeof p !== "object" || Array.isArray(p)) return null;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "string") out[k] = v;
        else if (v != null) out[k] = String(v);
      }
      return out;
    } catch {
      return null;
    }
  };
  const direct = tryParse(slice);
  if (direct) return direct;
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParse(slice.slice(start, end + 1));
  }
  return null;
}

export async function POST(req: NextRequest) {
  const key = getClientKey(req);
  if (!allowRate(key)) {
    return NextResponse.json(
      { error: "Too many translation requests. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const targetLocale =
    typeof o.targetLocale === "string" ? o.targetLocale.trim() : "";
  const messages = o.messages as Record<string, string> | undefined;
  if (!targetLocale || targetLocale.length > 24) {
    return NextResponse.json({ error: "Invalid targetLocale" }, { status: 400 });
  }
  if (!messages || typeof messages !== "object") {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  const keys = Object.keys(messages);
  if (keys.length === 0 || keys.length > 200) {
    return NextResponse.json({ error: "messages size invalid" }, { status: 400 });
  }

  const payload = JSON.stringify(messages);

  const system = [
    "You translate UI strings for a web app.",
    "You receive a JSON object whose keys are stable ids and values are English UI text.",
    `Translate every VALUE into the user's language identified by BCP-47 tag: ${targetLocale}.`,
    "Rules:",
    "- Keep every KEY exactly the same.",
    "- Preserve placeholders like {tail}, URLs, paths, and Markdown ** where present.",
    "- Keep product name Sidaopu / 斯道普 unchanged when it appears.",
    "- Output ONLY one valid JSON object (no markdown fences, no commentary).",
  ].join("\n");

  try {
    const raw = await callDeepSeekChat([
      { role: "system", content: system },
      { role: "user", content: payload },
    ]);
    const translated = extractJsonObject(raw);
    if (!translated || Object.keys(translated).length === 0) {
      return NextResponse.json(
        { error: "Could not parse translation JSON" },
        { status: 502 },
      );
    }
    const merged: Record<string, string> = { ...messages };
    for (const k of keys) {
      if (typeof translated[k] === "string" && translated[k].trim()) {
        merged[k] = translated[k];
      }
    }
    return NextResponse.json({ translations: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Translation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
