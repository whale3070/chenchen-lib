import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type ChapterDraft = { title: string; content: string };

const MAX_INPUT_CHARS = 40000;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
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

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function normalizeChapters(chapters: unknown): ChapterDraft[] {
  if (!Array.isArray(chapters)) return [];
  return chapters
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const content = typeof o.content === "string" ? o.content.trim() : "";
      if (!title || !content) return null;
      return { title, content };
    })
    .filter((x): x is ChapterDraft => Boolean(x))
    .slice(0, 60);
}

function fallbackSplit(text: string): ChapterDraft[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const byHeading = normalized.split(/(?=第[一二三四五六七八九十百千\d]+章)/g).filter(Boolean);
  if (byHeading.length >= 2) {
    return byHeading.slice(0, 60).map((s, idx) => {
      const firstLine = s.split("\n")[0]?.trim() || "";
      const title = /^第[一二三四五六七八九十百千\d]+章/.test(firstLine)
        ? firstLine
        : `第${idx + 1}章`;
      return { title, content: s.trim() };
    });
  }
  const step = 3000;
  const out: ChapterDraft[] = [];
  for (let i = 0; i < normalized.length; i += step) {
    const piece = normalized.slice(i, i + step).trim();
    if (!piece) continue;
    out.push({ title: `第${out.length + 1}章`, content: piece });
    if (out.length >= 60) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const text = typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text : "";
  if (!text.trim()) return badRequest("缺少小说文本");

  const envFallback = await readFallbackEnv();
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    envFallback.DEEPSEEK_API_KEY ||
    envFallback.OPENAI_API_KEY;
  const baseUrl =
    process.env.DEEPSEEK_BASE_URL || envFallback.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || envFallback.DEEPSEEK_MODEL || "deepseek-chat";

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 DEEPSEEK_API_KEY（可放在 apps/web/.env.production 或 /root/chenchen-lib/.env.production）" },
      { status: 500 },
    );
  }

  const clipped = text.slice(0, MAX_INPUT_CHARS);
  const prompt = [
    "请将以下中文小说文本自动排版并切分为连贯章节。",
    "输出必须是 JSON 对象，格式：",
    '{"chapters":[{"title":"第一章 ...","content":"章节正文"}]}',
    "要求：",
    "1) title 为中文章节名；2) content 为纯文本段落（可换行）；",
    "3) 不要输出除 JSON 以外的任何文字。",
    "",
    "小说文本：",
    clipped,
  ].join("\n");

  try {
    const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是专业中文出版编辑，擅长章节结构化与排版整理。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!resp.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "DeepSeek 请求失败" },
        { status: 502 },
      );
    }
    const raw = data.choices?.[0]?.message?.content ?? "";
    const jsonText = extractJsonObject(raw);
    const parsed = jsonText ? (JSON.parse(jsonText) as { chapters?: unknown }) : null;
    const chapters = normalizeChapters(parsed?.chapters);
    if (chapters.length > 0) {
      return NextResponse.json({ chapters, usedFallback: false });
    }
  } catch {
    // fallback below
  }

  const fallback = fallbackSplit(text);
  if (fallback.length === 0) {
    return NextResponse.json({ error: "文本解析失败，无法切章" }, { status: 500 });
  }
  return NextResponse.json({ chapters: fallback, usedFallback: true });
}
