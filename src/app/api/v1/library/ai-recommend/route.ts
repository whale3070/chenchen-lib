import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { buildPublicCatalogForAi } from "@/lib/server/library-catalog-for-ai";
import type { ReaderAiMessage } from "@/types/reader-ai-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

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

/** 供推荐回复里生成读者可点的绝对链接 */
function inferOriginFromRequest(req: NextRequest): string | null {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return null;
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}

function normalizeSiteOrigin(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  return s;
}

function absoluteReaderUrl(siteOrigin: string | null, readerPath: string): string {
  const path = readerPath.startsWith("/") ? readerPath : `/${readerPath}`;
  if (!siteOrigin) return path;
  const base = normalizeSiteOrigin(siteOrigin);
  return `${base}${path}`;
}

/** 将模型或旧版文案里的 `Link: /library/...` 换成可点的 Markdown 绝对链接 */
function postProcessReplyLinks(text: string, siteOrigin: string | null): string {
  if (!siteOrigin) return text;
  return text.replace(
    /(^|\n)(\s*)Link:\s*(\/library\/[^\s]+)/g,
    (_m, lead, spaces, path) => {
      const cleanPath = path.replace(/[。，,.、]+$/u, "");
      const abs = absoluteReaderUrl(siteOrigin, cleanPath);
      return `${lead}${spaces}**阅读链接**（点击或复制均可）：[${abs}](${abs})`;
    },
  );
}

function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const k = trimmed.slice(0, idx).trim();
  let v = trimmed.slice(idx + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return [k, v];
}

async function readFallbackEnv(): Promise<Record<string, string>> {
  const fp = path.join(process.cwd(), "..", "..", ".env.production");
  try {
    const raw = await fs.readFile(fp, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const kv = parseDotEnvLine(line);
      if (!kv) continue;
      out[kv[0]] = kv[1];
    }
    return out;
  } catch {
    return {};
  }
}

type DeepSeekMsg = { role: "system" | "user" | "assistant"; content: string };

async function callDeepSeek(messages: DeepSeekMsg[]): Promise<string> {
  const envFallback = await readFallbackEnv();
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    envFallback.DEEPSEEK_API_KEY ||
    envFallback.OPENAI_API_KEY;
  const baseUrl =
    process.env.DEEPSEEK_BASE_URL ||
    envFallback.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com";
  const model =
    process.env.DEEPSEEK_MODEL || envFallback.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) {
    throw new Error("AI 服务未配置（缺少 DEEPSEEK_API_KEY）");
  }
  const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`AI 请求失败 (${resp.status}) ${t.slice(0, 200)}`);
  }
  const respText = await resp.text();
  const trimmed = respText.trim();
  if (!trimmed) {
    throw new Error("AI 返回空响应（无正文）");
  }
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(trimmed) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch {
    throw new Error(`AI 返回非 JSON：${trimmed.slice(0, 160)}`);
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("AI 返回为空");
  return text;
}

function extractJsonArray(raw: string): unknown[] | null {
  const code = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const slice = code ? code[1] : raw;
  try {
    const parsed = JSON.parse(slice.trim()) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = slice.indexOf("[");
    const end = slice.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(slice.slice(start, end + 1)) as unknown;
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: NextRequest) {
  const key = getClientKey(req);
  if (!allowRate(key)) {
    return NextResponse.json(
      { error: "请求过于频繁，请约 1 分钟后再试（每分钟最多 5 次）" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    const raw = await req.text();
    body = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const messages = o.messages as ReaderAiMessage[] | undefined;
  const locale =
    typeof o.locale === "string" && o.locale.trim() ? o.locale.trim() : "en";
  const siteOriginFromClient =
    typeof o.siteOrigin === "string" && o.siteOrigin.trim()
      ? o.siteOrigin.trim()
      : null;
  const effectiveOrigin =
    siteOriginFromClient ?? inferOriginFromRequest(req) ?? null;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "缺少 messages" }, { status: 400 });
  }

  const catalog = await buildPublicCatalogForAi({ maxItems: 300 });
  const catalogJson = JSON.stringify(
    catalog.map((c) => ({
      articleId: c.articleId,
      title: c.title,
      tags: c.tags,
      synopsisSnippet: c.synopsisSnippet,
      totalChapters: c.totalChapters,
      trialChapters: c.trialChapters,
      paymentMode: c.paymentMode,
      language: c.language,
    })),
  );

  const system = [
    "You are the official AI novel recommender for THIS platform only.",
    "",
    "STRICT RULES:",
    "1) ONLY recommend novels listed in CATALOG_JSON (match by articleId). Never invent titles, links, or tags.",
    "2) For each book, respect paymentMode from catalog:",
    "   - If paymentMode is \"paid\": explain that roughly the first trialChapters (about 3–5) can be read as preview, and unlocking the rest of the book requires payment.",
    "   - If paymentMode is \"free\": explain that reading is free / fully open on this platform (no paid unlock).",
    "3) No off-topic chat: refuse unrelated questions briefly and steer back to recommending from this catalog.",
    "4) Match user preferences (genre, tone, tropes) to tags and synopsisSnippet.",
    "5) Multilingual: reply in the user's language when possible; prefer clear English for global readers. User locale hint: " +
      locale +
      ".",
    "",
    "OUTPUT FORMAT (mandatory):",
    "Return ONE JSON array only (no markdown outside the array) with 3 to 5 objects:",
    '[{"articleId":"...","title":"...","tags":["..."],"why":"...","accessNote":"...","readerPath":"/library/{articleId}"}]',
    "accessNote must clearly state free vs paid preview + paid unlock (for paid) using catalog fields.",
    "readerPath must be exactly /library/{articleId} using the catalog articleId (server will turn into a full clickable URL for readers).",
    "",
    "CATALOG_JSON:",
    catalogJson,
  ].join("\n");

  const convo: DeepSeekMsg[] = [
    { role: "system", content: system },
    ...messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-16)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
  ];

  try {
    const raw = await callDeepSeek(convo);
    const arr = extractJsonArray(raw);
    if (!arr || arr.length === 0) {
      const fallbackReply = postProcessReplyLinks(raw, effectiveOrigin);
      return NextResponse.json({
        reply: fallbackReply,
        pickedArticleIds: [],
      });
    }
    const allowed = new Set(catalog.map((c) => c.articleId));
    const picked: string[] = [];
    const lines: string[] = [];
    for (const row of arr.slice(0, 6)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const aid = typeof r.articleId === "string" ? r.articleId.trim() : "";
      if (!aid || !allowed.has(aid)) continue;
      picked.push(aid);
      const title = typeof r.title === "string" ? r.title : "";
      const tags = Array.isArray(r.tags)
        ? r.tags.filter((x): x is string => typeof x === "string").join(", ")
        : "";
      const why = typeof r.why === "string" ? r.why : "";
      const accessNote = typeof r.accessNote === "string" ? r.accessNote : "";
      const readerPath =
        typeof r.readerPath === "string"
          ? r.readerPath
          : `/library/${aid}`;
      const abs = absoluteReaderUrl(effectiveOrigin, readerPath);
      const linkMd = `[${abs}](${abs})`;
      lines.push(
        [
          `**${title}**`,
          tags ? `Tags: ${tags}` : "",
          why,
          accessNote,
          `**阅读链接**（点击或复制均可）：${linkMd}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    const reply = postProcessReplyLinks(
      lines.length > 0
        ? lines.join("\n\n---\n\n")
        : "当前书库中没有匹配的作品，请换一些关键词或说得更宽泛些。",
      effectiveOrigin,
    );
    return NextResponse.json({ reply, pickedArticleIds: picked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 暂时不可用";
    return NextResponse.json(
      { reply: "", pickedArticleIds: [], error: msg },
      { status: 200 },
    );
  }
}
