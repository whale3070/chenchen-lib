import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { isPaidMemberActive } from "@/lib/server/paid-membership";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type StructurePayload = {
  nodes?: Array<{
    kind?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function safeNovelSegment(novelId: string) {
  return novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return [key, val];
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

function structurePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "structure",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function novelsIndexPath(authorLower: string) {
  return path.join(process.cwd(), ".data", "novels", "authors", `${authorLower}.json`);
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseAiJson(raw: string): { synopsis: string; tags: string[] } | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] ?? raw).trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1)) as {
      synopsis?: unknown;
      tags?: unknown;
    };
    const synopsis =
      typeof parsed.synopsis === "string" ? parsed.synopsis.trim().slice(0, 5000) : "";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((x): x is string => typeof x === "string")
          .map((t) => t.replace(/^#+/, "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];
    if (!synopsis) return null;
    return { synopsis, tags };
  } catch {
    return null;
  }
}

async function callDeepseek(text: string, workTitle: string) {
  const envFallback = await readFallbackEnv();
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    envFallback.DEEPSEEK_API_KEY ||
    envFallback.OPENAI_API_KEY;
  const baseUrl =
    process.env.DEEPSEEK_BASE_URL || envFallback.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || envFallback.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) return null;

  const prompt = [
    "你是中文内容发行编辑。请根据作品片段生成发布元数据。",
    "只输出 JSON：",
    '{"synopsis":"100-220字中文简介","tags":["标签1","标签2","标签3"]}',
    "要求：",
    "1) synopsis 用第三人称，适合作品详情页，不剧透结局。",
    "2) tags 输出 3-8 个短标签（题材/风格/主题）。",
    "3) 不要输出 JSON 以外的任何内容。",
    "",
    `作品标题：${workTitle || "未命名作品"}`,
    "正文片段：",
    text.slice(0, 8000),
  ].join("\n");

  const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: "你是严格输出 JSON 的中文编辑助手。" },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return null;
  return parseAiJson(raw);
}

export async function POST(req: NextRequest) {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return unauthorized("缺少或无效的 x-wallet-address");
  }
  const walletLower = safeAuthorId(headerAddr);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;
  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  const novelId = typeof o.novelId === "string" ? o.novelId.trim() : "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");

  const authorLower = walletLower;
  let workTitle = "";
  try {
    const raw = await fs.readFile(novelsIndexPath(authorLower), "utf8");
    const data = JSON.parse(raw) as {
      novels?: Array<{ id?: string; title?: string }>;
    };
    const found = data.novels?.find((n) => n.id === novelId);
    workTitle = typeof found?.title === "string" ? found.title.trim().slice(0, 300) : "";
  } catch {
    // keep empty
  }

  let sample = "";
  try {
    const raw = await fs.readFile(structurePath(authorLower, novelId), "utf8");
    const structure = JSON.parse(raw) as StructurePayload;
    const chapters = (structure.nodes ?? []).filter((n) => n.kind === "chapter").slice(0, 4);
    sample = chapters
      .map((ch) => {
        const html = ch.metadata?.chapterHtml;
        const text = typeof html === "string" ? htmlToPlainText(html) : "";
        const title = typeof ch.title === "string" ? ch.title.trim() : "";
        return [title ? `【${title}】` : "", text.slice(0, 1200)].filter(Boolean).join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
  } catch {
    // keep empty
  }

  const fallbackSynopsis = (sample || workTitle || "这是一部连载作品。")
    .replace(/\s+/g, " ")
    .slice(0, 180);
  const fallbackTags = ["原创", "连载", "中文"];

  const ai =
    sample && (await isPaidMemberActive(walletLower))
      ? await callDeepseek(sample, workTitle)
      : null;
  const synopsis = (ai?.synopsis || fallbackSynopsis || "这是一部连载作品。").slice(0, 5000);
  const tags = (ai?.tags && ai.tags.length > 0 ? ai.tags : fallbackTags).slice(0, 12);
  return NextResponse.json({ synopsis, tags, generatedBy: ai ? "deepseek" : "fallback" });
}

