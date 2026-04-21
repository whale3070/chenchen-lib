import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getEnglishSiteMessages } from "@/i18n/site-messages";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeUiLocale } from "@/lib/site-locale";

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

/** 与英文源文案版本绑定，文案更新后自动失效 */
function fingerprintEnglishMessages(messages: Record<string, string>): string {
  const keys = Object.keys(messages).sort();
  const ordered: Record<string, string> = {};
  for (const k of keys) {
    ordered[k] = messages[k] ?? "";
  }
  return createHash("sha256").update(JSON.stringify(ordered), "utf8").digest("hex");
}

function localeToCacheFilename(localeNorm: string): string {
  const safe = localeNorm.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 64);
  return `${safe || "unknown"}.json`;
}

function sharedCachePath(localeNorm: string): string {
  return path.join(
    process.cwd(),
    ".data",
    "site-ui-mt-shared",
    localeToCacheFilename(localeNorm),
  );
}

type DiskCacheShape = {
  sourceHash: string;
  targetLocale: string;
  cachedAt: string;
  translations: Record<string, string>;
};

async function readSharedDiskCache(
  localeNorm: string,
  expectedHash: string,
): Promise<Record<string, string> | null> {
  const fp = sharedCachePath(localeNorm);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const p = JSON.parse(raw) as Partial<DiskCacheShape>;
    if (
      typeof p.sourceHash === "string" &&
      p.sourceHash === expectedHash &&
      p.translations &&
      typeof p.translations === "object" &&
      !Array.isArray(p.translations)
    ) {
      return p.translations as Record<string, string>;
    }
  } catch {
    /* ENOENT or bad JSON */
  }
  return null;
}

async function writeSharedDiskCache(
  localeNorm: string,
  sourceHash: string,
  translations: Record<string, string>,
): Promise<void> {
  const fp = sharedCachePath(localeNorm);
  const dir = path.dirname(fp);
  await fs.mkdir(dir, { recursive: true });
  const payload: DiskCacheShape = {
    sourceHash,
    targetLocale: localeNorm,
    cachedAt: new Date().toISOString(),
    translations,
  };
  const body = JSON.stringify(payload, null, 2);
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, fp);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const targetLocaleRaw =
    typeof o.targetLocale === "string" ? o.targetLocale.trim() : "";
  const localeNorm = normalizeUiLocale(targetLocaleRaw);
  if (!targetLocaleRaw || !localeNorm) {
    return NextResponse.json({ error: "Invalid targetLocale" }, { status: 400 });
  }

  /** 始终以服务端英文词条为准，避免客户端篡改与缓存投毒 */
  const messages = getEnglishSiteMessages();
  const keys = Object.keys(messages);
  if (keys.length === 0 || keys.length > 200) {
    return NextResponse.json({ error: "messages size invalid" }, { status: 500 });
  }

  const sourceHash = fingerprintEnglishMessages(messages);

  const diskHit = await readSharedDiskCache(localeNorm, sourceHash);
  if (diskHit) {
    const merged: Record<string, string> = { ...messages };
    for (const k of keys) {
      if (typeof diskHit[k] === "string" && diskHit[k].trim()) {
        merged[k] = diskHit[k];
      }
    }
    return NextResponse.json(
      { translations: merged },
      { headers: { "x-ui-mt-cache": "disk-hit" } },
    );
  }

  const key = getClientKey(req);
  if (!allowRate(key)) {
    return NextResponse.json(
      { error: "Too many translation requests. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const payload = JSON.stringify(messages);

  const system = [
    "You translate UI strings for a web app.",
    "You receive a JSON object whose keys are stable ids and values are English UI text.",
    `Translate every VALUE into the user's language identified by BCP-47 tag: ${localeNorm}.`,
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

    await writeSharedDiskCache(localeNorm, sourceHash, merged).catch((err) => {
      console.error("[translate-ui-messages] shared cache write failed:", err);
    });

    return NextResponse.json(
      { translations: merged },
      { headers: { "x-ui-mt-cache": "miss" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Translation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
