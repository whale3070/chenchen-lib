/**
 * 与 /api/v1/ai/chapterize 相同的切章逻辑，供 Route 与 novels/from-txt 进程内直接调用，
 * 避免服务端 fetch 自身 origin（公网部署时常导致 Failed to fetch / 连接失败）。
 */
import fs from "node:fs/promises";
import path from "node:path";

export type ChapterDraft = { title: string; content: string };
export type ChapterizeMode = "auto" | "rule" | "llm";

export type ChapterizeEngine = "rule" | "llm" | "fallback";

export type ChapterizeResult = {
  chapters: ChapterDraft[];
  truncated: boolean;
  engine: ChapterizeEngine;
  usedFallback: boolean;
  mode: ChapterizeMode;
  reason?: string;
};

const MAX_INPUT_CHARS = 40000;
const MAX_CHAPTERS = 2000;
const TARGET_CHAPTER_CHARS = 2600;
const MIN_CHAPTER_CHARS = 900;
const MAX_CHAPTER_CHARS = 4200;

export class ChapterizeHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ChapterizeHttpError";
    this.statusCode = statusCode;
  }
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

const CHAPTER_HEADING_SPLIT_RE =
  /(?=^\s*(?:第\s*[一二三四五六七八九十百千万零〇两\d]+\s*[章节回篇卷](?=\s|$|[：:，。、！？!?「」『』（(])|(?:chapter|chap\.?)\s*(?:\d+|[ivxlcdm]+)\b))/gim;

const CHAPTER_TITLE_FIRST_LINE_RE =
  /^(?:第\s*[一二三四五六七八九十百千万零〇两\d]+\s*[章节回篇卷](?=\s|$|[：:，。、！？!?「」『』（(])|(?:chapter|chap\.?)\s*(?:\d+|[ivxlcdm]+)\b)/i;

function fallbackSplit(text: string): { chapters: ChapterDraft[]; splitByHeadings: boolean } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return { chapters: [], splitByHeadings: false };
  const byHeading = normalized
    .split(CHAPTER_HEADING_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (byHeading.length >= 2) {
    const chapters = byHeading.slice(0, MAX_CHAPTERS).map((s, idx) => {
      const firstLine = s.split("\n")[0]?.trim() || "";
      const title = CHAPTER_TITLE_FIRST_LINE_RE.test(firstLine) ? firstLine : `第${idx + 1}章`;
      return { title, content: s.trim() };
    });
    return { chapters, splitByHeadings: true };
  }
  const step = TARGET_CHAPTER_CHARS;
  const out: ChapterDraft[] = [];
  for (let i = 0; i < normalized.length; i += step) {
    const piece = normalized.slice(i, i + step).trim();
    if (!piece) continue;
    out.push({ title: `第${out.length + 1}章`, content: piece });
    if (out.length >= MAX_CHAPTERS) break;
  }
  return { chapters: out, splitByHeadings: false };
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
  const t = paragraph.trim();
  if (t.length <= limit) return [t];
  if (isDialogueParagraph(t) && t.length <= limit * 2) {
    return [t];
  }
  const sentences = t
    .split(/(?<=[。！？!?])/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    const out: string[] = [];
    for (let i = 0; i < t.length; i += limit) {
      out.push(t.slice(i, i + limit).trim());
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

function refineChaptersLight(raw: ChapterDraft[]): ChapterDraft[] {
  const cleaned = raw
    .map((ch) => ({
      title: ch.title.trim(),
      content: ch.content.trim(),
    }))
    .filter((ch) => ch.content.length > 0);
  return ensureUniqueTitles(cleaned);
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
    /第\s*[一二三四五六七八九十百千万零〇两\d]+\s*[章节回篇卷]/g.test(normalized) ||
    /(?:Chapter|Chap\.?)\s*(?:\d+|[IVXLCDM]+)/gi.test(normalized) ||
    /卷[一二三四五六七八九十百千万零\d]+/g.test(normalized)
  );
}

/**
 * 是否与 chapterizeTextInternal 一致：本会走豆包/LLM 路径（需付费会员）。
 * rule、或 auto 且正文已有显式章节标、或 CHAPTERIZE_FORCE_REGEX_ONLY 时为 false。
 */
export function chapterizeNeedsModel(text: string, mode: ChapterizeMode): boolean {
  if (mode === "llm") return true;
  const forceRegexOnly = process.env.CHAPTERIZE_FORCE_REGEX_ONLY !== "0";
  if (forceRegexOnly || mode === "rule") return false;
  if (mode === "auto" && hasExplicitChapterMarks(text)) return false;
  return true;
}

export function parseChapterizeMode(raw: unknown): ChapterizeMode {
  if (raw === "rule" || raw === "llm" || raw === "auto") return raw;
  return "auto";
}

/**
 * 与 HTTP POST /api/v1/ai/chapterize 行为一致；失败抛 ChapterizeHttpError。
 */
export async function chapterizeTextInternal(
  text: string,
  mode: ChapterizeMode,
): Promise<ChapterizeResult> {
  if (!text.trim()) {
    throw new ChapterizeHttpError(400, "缺少小说文本");
  }

  const explicitChapterMarks = hasExplicitChapterMarks(text);
  const forceRegexOnly = process.env.CHAPTERIZE_FORCE_REGEX_ONLY !== "0";
  if (forceRegexOnly || mode === "rule" || (mode === "auto" && explicitChapterMarks)) {
    const { chapters: rawChapters, splitByHeadings } = fallbackSplit(text);
    const refined = splitByHeadings
      ? refineChaptersLight(rawChapters)
      : refineChapters(rawChapters);
    const truncated = refined.length >= MAX_CHAPTERS;
    const chapters = refined.slice(0, MAX_CHAPTERS);
    if (chapters.length === 0) {
      throw new ChapterizeHttpError(500, "文本解析失败，无法切章");
    }
    return {
      chapters,
      truncated,
      engine: "rule",
      usedFallback: false,
      mode,
      reason: forceRegexOnly
        ? "forced_regex_only"
        : mode === "rule"
          ? "forced_rule"
          : "explicit_chapter_marks",
    };
  }

  const envFallback = await readFallbackEnv();
  const { apiKey, baseUrl, model } = resolveDoubaoConfig(envFallback);

  if (!apiKey) {
    throw new ChapterizeHttpError(
      500,
      "未配置 ARK_API_KEY / DOUBAO_API_KEY（可放在 apps/web/.env.production 或 /root/chenchen-lib/.env.production）",
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
      throw new ChapterizeHttpError(502, `${rawError}${hint}`);
    }
    const raw = data.choices?.[0]?.message?.content ?? "";
    const jsonText = extractJsonObject(raw);
    const parsed = jsonText ? (JSON.parse(jsonText) as { chapters?: unknown }) : null;
    const refined = refineChapters(normalizeChapters(parsed?.chapters));
    const truncated = refined.length >= MAX_CHAPTERS;
    const chapters = refined.slice(0, MAX_CHAPTERS);
    if (chapters.length > 0) {
      return {
        chapters,
        truncated,
        engine: "llm",
        usedFallback: false,
        mode,
      };
    }
  } catch (e) {
    if (e instanceof ChapterizeHttpError) throw e;
    /* fall through to fallback */
  }

  const refinedFallback = refineChapters(fallbackSplit(text).chapters);
  const truncated = refinedFallback.length >= MAX_CHAPTERS;
  const fallback = refinedFallback.slice(0, MAX_CHAPTERS);
  if (fallback.length === 0) {
    throw new ChapterizeHttpError(500, "文本解析失败，无法切章");
  }
  return {
    chapters: fallback,
    truncated,
    engine: "fallback",
    usedFallback: true,
    mode,
  };
}
