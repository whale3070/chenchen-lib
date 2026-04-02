import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type ChapterDraft = { title: string; content: string };
type ChapterizeMode = "auto" | "rule" | "llm";

const MAX_INPUT_CHARS = 40000;
// 章节数量安全上限：用于防止异常输入导致内存膨胀，不应成为正常小说的截断点。
const MAX_CHAPTERS = 2000;
const TARGET_CHAPTER_CHARS = 2600;
const MIN_CHAPTER_CHARS = 900;
const MAX_CHAPTER_CHARS = 4200;

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
    .slice(0, MAX_CHAPTERS);
}

function resolveDoubaoConfig(envFallback: Record<string, string>) {
  const apiKey =
    process.env.ARK_API_KEY ||
    process.env.DOUBAO_API_KEY ||
    envFallback.ARK_API_KEY ||
    envFallback.DOUBAO_API_KEY;
  const baseUrl =
    process.env.ARK_BASE_URL ||
    process.env.DOUBAO_BASE_URL ||
    envFallback.ARK_BASE_URL ||
    envFallback.DOUBAO_BASE_URL ||
    "https://ark.cn-beijing.volces.com/api/v3";
  const model =
    process.env.ARK_MODEL ||
    process.env.DOUBAO_MODEL ||
    envFallback.ARK_MODEL ||
    envFallback.DOUBAO_MODEL ||
    "doubao-seed-1-8-251228";
  return { apiKey, baseUrl, model };
}

function fallbackSplit(text: string): ChapterDraft[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const byHeading = normalized.split(/(?=第[一二三四五六七八九十百千\d]+章)/g).filter(Boolean);
  if (byHeading.length >= 2) {
    return byHeading.slice(0, MAX_CHAPTERS).map((s, idx) => {
      const firstLine = s.split("\n")[0]?.trim() || "";
      const title = /^第[一二三四五六七八九十百千\d]+章/.test(firstLine)
        ? firstLine
        : `第${idx + 1}章`;
      return { title, content: s.trim() };
    });
  }
  const step = TARGET_CHAPTER_CHARS;
  const out: ChapterDraft[] = [];
  for (let i = 0; i < normalized.length; i += step) {
    const piece = normalized.slice(i, i + step).trim();
    if (!piece) continue;
    out.push({ title: `第${out.length + 1}章`, content: piece });
    if (out.length >= MAX_CHAPTERS) break;
  }
  return out;
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isDialogueParagraph(p: string): boolean {
  const s = p.trim();
  return (
    /^[“"‘'「『]/.test(s) ||
    /[：:]\s*[“"‘'「『]/.test(s) ||
    /^[-—]\s*/.test(s)
  );
}

function splitLongParagraph(paragraph: string, limit: number): string[] {
  const text = paragraph.trim();
  if (text.length <= limit) return [text];
  if (isDialogueParagraph(text) && text.length <= limit * 2) {
    // 对话段尽量不拆，避免人物对白断裂。
    return [text];
  }
  const sentences = text
    .split(/(?<=[。！？!?])/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += limit) {
      out.push(text.slice(i, i + limit).trim());
    }
    return out.filter(Boolean);
  }
  const out: string[] = [];
  let bucket = "";
  for (const s of sentences) {
    if (!bucket) {
      bucket = s;
      continue;
    }
    if (bucket.length + s.length <= limit) {
      bucket += s;
    } else {
      out.push(bucket.trim());
      bucket = s;
    }
  }
  if (bucket) out.push(bucket.trim());
  return out.filter(Boolean);
}

function splitChapterContent(content: string): string[] {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length === 0) return [];
  const out: string[] = [];
  let bucket: string[] = [];
  let bucketLen = 0;
  const pushBucket = () => {
    if (bucket.length === 0) return;
    out.push(bucket.join("\n\n").trim());
    bucket = [];
    bucketLen = 0;
  };
  for (const para of paragraphs) {
    const pieces = splitLongParagraph(para, MAX_CHAPTER_CHARS);
    for (const piece of pieces) {
      const nextLen = bucketLen + (bucketLen > 0 ? 2 : 0) + piece.length;
      const allowDialogueOverflow =
        isDialogueParagraph(piece) && nextLen <= Math.floor(MAX_CHAPTER_CHARS * 1.2);
      if (nextLen > MAX_CHAPTER_CHARS && bucketLen >= MIN_CHAPTER_CHARS && !allowDialogueOverflow) {
        pushBucket();
      }
      bucket.push(piece);
      bucketLen += (bucketLen > 0 ? 2 : 0) + piece.length;
      if (bucketLen >= TARGET_CHAPTER_CHARS && !isDialogueParagraph(piece)) {
        pushBucket();
      }
    }
  }
  pushBucket();
  return out.filter(Boolean);
}

function normalizeTitleKey(title: string): string {
  // 保留括号内容（如“（60/106）”），避免被误判为重复标题再追加“（n）”。
  return title.replace(/[\s\-—_:：·.。,【】\[\]]+/g, "").trim();
}

function ensureUniqueTitles(chapters: ChapterDraft[]): ChapterDraft[] {
  const seen = new Map<string, number>();
  return chapters.map((ch, idx) => {
    const fallbackTitle = `第${idx + 1}章`;
    const baseTitle = ch.title.trim() || fallbackTitle;
    const key = normalizeTitleKey(baseTitle) || `chapter-${idx + 1}`;
    const cnt = (seen.get(key) ?? 0) + 1;
    seen.set(key, cnt);
    const title = cnt === 1 ? baseTitle : `${baseTitle}（${cnt}）`;
    return { ...ch, title };
  });
}

function mergeTooShortChapters(chapters: ChapterDraft[]): ChapterDraft[] {
  if (chapters.length <= 1) return chapters;
  const out: ChapterDraft[] = [];
  for (const ch of chapters) {
    if (out.length === 0) {
      out.push(ch);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev.content.length < MIN_CHAPTER_CHARS) {
      out[out.length - 1] = {
        ...prev,
        content: `${prev.content}\n\n${ch.content}`.trim(),
      };
      continue;
    }
    out.push(ch);
  }
  if (out.length >= 2) {
    const tail = out[out.length - 1];
    if (tail.content.length < Math.floor(MIN_CHAPTER_CHARS * 0.7)) {
      const prev = out[out.length - 2];
      out[out.length - 2] = {
        ...prev,
        content: `${prev.content}\n\n${tail.content}`.trim(),
      };
      out.pop();
    }
  }
  return out;
}

function stripTrailingNumericSuffix(title: string): string {
  return title.replace(/(?:（\d+\/\d+）|（\d+）|\(\d+\/\d+\)|\(\d+\))\s*$/g, "").trim();
}

function renumberLikelyBrokenChapterSeries(chapters: ChapterDraft[]): ChapterDraft[] {
  if (chapters.length < 3) return chapters;
  const bases = chapters.map((ch) => stripTrailingNumericSuffix(ch.title));
  const firstBase = bases[0] ?? "";
  const allSameBase = firstBase.length > 0 && bases.every((b) => b === firstBase);
  const looksLikeChapter =
    /^第[一二三四五六七八九十百千万零\d]+章$/.test(firstBase) ||
    /^chapter\s*\d+$/i.test(firstBase);
  if (!allSameBase || !looksLikeChapter) return chapters;

  return chapters.map((ch, idx) => {
    const m = ch.title.match(/[（(](\d+)\s*\/\s*(\d+)[）)]/);
    const fromSuffix = m ? Number.parseInt(m[1], 10) : Number.NaN;
    const n = Number.isFinite(fromSuffix) && fromSuffix > 0 ? fromSuffix : idx + 1;
    return { ...ch, title: `第${n}章` };
  });
}

function refineChapters(raw: ChapterDraft[]): ChapterDraft[] {
  const expanded: ChapterDraft[] = [];
  for (const item of raw) {
    const title = item.title.trim();
    const content = item.content.trim();
    if (!content) continue;
    const parts = splitChapterContent(content);
    if (parts.length <= 1) {
      expanded.push({ title, content });
      continue;
    }
    parts.forEach((part, idx) => {
      expanded.push({
        title: `${title || "未命名章节"}（${idx + 1}/${parts.length}）`,
        content: part,
      });
    });
  }
  const merged = mergeTooShortChapters(expanded);
  const repaired = renumberLikelyBrokenChapterSeries(merged);
  return ensureUniqueTitles(repaired);
}

function hasExplicitChapterMarks(text: string): boolean {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return (
    /第[一二三四五六七八九十百千万零\d]+章/g.test(normalized) ||
    /Chapter\s+\d+/gi.test(normalized) ||
    /卷[一二三四五六七八九十百千万零\d]+/g.test(normalized)
  );
}

function parseMode(raw: unknown): ChapterizeMode {
  if (raw === "rule" || raw === "llm" || raw === "auto") return raw;
  return "auto";
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
  const mode = parseMode((body as { mode?: unknown }).mode);
  if (!text.trim()) return badRequest("缺少小说文本");

  const explicitChapterMarks = hasExplicitChapterMarks(text);

  if (mode === "rule" || (mode === "auto" && explicitChapterMarks)) {
    const refined = refineChapters(fallbackSplit(text));
    const truncated = refined.length >= MAX_CHAPTERS;
    const chapters = refined.slice(0, MAX_CHAPTERS);
    if (chapters.length === 0) {
      return NextResponse.json({ error: "文本解析失败，无法切章" }, { status: 500 });
    }
    return NextResponse.json({
      chapters,
      usedFallback: false,
      engine: "rule",
      mode,
      truncated,
      reason: mode === "rule" ? "forced_rule" : "explicit_chapter_marks",
    });
  }

  const envFallback = await readFallbackEnv();
  const { apiKey, baseUrl, model } = resolveDoubaoConfig(envFallback);

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "未配置 ARK_API_KEY / DOUBAO_API_KEY（可放在 apps/web/.env.production 或 /root/chenchen-lib/.env.production）",
      },
      { status: 500 },
    );
  }

  const clipped = text.slice(0, MAX_INPUT_CHARS);
  const prompt = [
    "请将以下中文小说文本自动排版并切分为连贯章节。",
    "输出必须是 JSON 对象，格式：",
    '{"chapters":[{"title":"第一章 ...","content":"章节正文"}]}',
    "要求：",
    `1) title 为中文章节名；2) content 为纯文本段落（可换行）；3) 每章建议长度约 ${TARGET_CHAPTER_CHARS} 字（允许上下浮动）；`,
    "4) 尽量不要把人物对话拆散到不同章节；5) 标题避免重复；",
    "6) 不要输出除 JSON 以外的任何文字。",
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
        max_completion_tokens: 16384,
        reasoning_effort: "medium",
        temperature: 0.1,
        messages: [
          { role: "system", content: "你是专业中文出版编辑，擅长章节结构化与排版整理。只输出 JSON。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!resp.ok) {
      const rawError = data?.error?.message || "豆包请求失败";
      const hint =
        /ModelNotOpen|has not activated the model/i.test(rawError)
          ? "（当前账号未开通该模型，请检查 ARK_MODEL / DOUBAO_MODEL）"
          : "";
      return NextResponse.json(
        { error: `${rawError}${hint}` },
        { status: 502 },
      );
    }
    const raw = data.choices?.[0]?.message?.content ?? "";
    const jsonText = extractJsonObject(raw);
    const parsed = jsonText ? (JSON.parse(jsonText) as { chapters?: unknown }) : null;
    const refined = refineChapters(normalizeChapters(parsed?.chapters));
    const truncated = refined.length >= MAX_CHAPTERS;
    const chapters = refined.slice(0, MAX_CHAPTERS);
    if (chapters.length > 0) {
      return NextResponse.json({
        chapters,
        usedFallback: false,
        engine: "llm",
        mode,
        truncated,
      });
    }
  } catch {
    // fallback below
  }

  const refinedFallback = refineChapters(fallbackSplit(text));
  const truncated = refinedFallback.length >= MAX_CHAPTERS;
  const fallback = refinedFallback.slice(0, MAX_CHAPTERS);
  if (fallback.length === 0) {
    return NextResponse.json({ error: "文本解析失败，无法切章" }, { status: 500 });
  }
  return NextResponse.json({
    chapters: fallback,
    usedFallback: true,
    engine: "fallback",
    mode,
    truncated,
  });
}
