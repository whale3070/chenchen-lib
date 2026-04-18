import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";
import { NextResponse, type NextRequest } from "next/server";
import { paidMemberForbiddenResponse } from "@/lib/server/paid-membership";
import { trackWalletEvent } from "@/lib/server/wallet-analytics";

export const runtime = "nodejs";

const MAX_MODEL_INPUT_CHARS = 12000;
const CHUNK_TARGET_CHARS = 1400;
const CHUNK_MAX_RETRY = 2;

type StructurePayload = {
  nodes?: Array<{
    id?: string;
    kind?: string;
    metadata?: Record<string, unknown>;
  }>;
};

type TranslationStore = {
  authorId: string;
  novelId: string;
  updatedAt: string;
  languages?: Record<
    string,
    {
      updatedAt: string;
      displayTitle?: string;
      displaySynopsis?: string;
      tags?: string[];
      draftText?: string;
      manualText?: string;
      chapters?: Record<
        string,
        {
          translatedText: string;
          updatedAt: string;
        }
      >;
    }
  >;
};

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function safeNovelSegment(novelId: string) {
  return novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function structurePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "structure",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function draftPath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "drafts",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function translationStorePath(authorLower: string, novelId: string) {
  return path.join(
    process.cwd(),
    ".data",
    "translations",
    `${authorLower}_${safeNovelSegment(novelId)}.json`,
  );
}

function parseWalletHeader(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: safeAuthorId(headerAddr) };
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

async function readChapterText(
  authorLower: string,
  novelId: string,
  chapterId: string,
): Promise<string> {
  const raw = await fs.readFile(structurePath(authorLower, novelId), "utf8");
  const structure = parseLeadingJsonValue(raw) as StructurePayload;
  const chapter = (structure.nodes ?? []).find(
    (n) => n.kind === "chapter" && n.id === chapterId,
  );
  const htmlCandidate =
    chapter?.metadata?.chapterHtmlMobile ??
    chapter?.metadata?.chapterHtmlDesktop ??
    chapter?.metadata?.chapterHtml;
  if (typeof htmlCandidate !== "string") return "";
  return htmlToPlainText(htmlCandidate);
}

async function readAllChapterText(authorLower: string, novelId: string): Promise<string> {
  const raw = await fs.readFile(structurePath(authorLower, novelId), "utf8");
  const structure = parseLeadingJsonValue(raw) as StructurePayload;
  const chapterTexts = (structure.nodes ?? [])
    .filter((n) => n.kind === "chapter")
    .map((chapter) => {
      const htmlCandidate =
        chapter?.metadata?.chapterHtmlMobile ??
        chapter?.metadata?.chapterHtmlDesktop ??
        chapter?.metadata?.chapterHtml;
      return typeof htmlCandidate === "string" ? htmlToPlainText(htmlCandidate) : "";
    })
    .map((t) => t.trim())
    .filter(Boolean);
  return chapterTexts.join("\n\n").trim();
}

async function readDraftText(authorLower: string, novelId: string): Promise<string> {
  const raw = await fs.readFile(draftPath(authorLower, novelId), "utf8");
  const draft = parseLeadingJsonValue(raw) as { html?: unknown };
  const html = typeof draft.html === "string" ? draft.html : "";
  return htmlToPlainText(html);
}

async function readNovelTitle(authorLower: string, novelId: string): Promise<string> {
  const fp = path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${authorLower}.json`,
  );
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = parseLeadingJsonValue(raw) as {
      novels?: Array<{ id?: string; title?: string }>;
    };
    const found = parsed.novels?.find((n) => n.id === novelId);
    return typeof found?.title === "string" ? found.title.trim().slice(0, 120) : "";
  } catch {
    return "";
  }
}

function languageLabel(code: string): string {
  const map: Record<string, string> = {
    en: "英语",
    ja: "日语",
    ko: "韩语",
    fr: "法语",
    de: "德语",
    es: "西班牙语",
    ru: "俄语",
    ar: "阿拉伯语",
    pt: "葡萄牙语",
    it: "意大利语",
    vi: "越南语",
    th: "泰语",
    id: "印尼语",
    ms: "马来语",
  };
  return map[code] ?? code.toUpperCase();
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function splitForTranslation(text: string, targetSize = CHUNK_TARGET_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let bucket = "";
  for (const p of paragraphs) {
    if (!bucket) {
      bucket = p;
      continue;
    }
    if (bucket.length + 2 + p.length <= targetSize) {
      bucket += `\n\n${p}`;
    } else {
      chunks.push(bucket);
      bucket = p;
    }
  }
  if (bucket) chunks.push(bucket);
  if (chunks.length === 0 && normalized) chunks.push(normalized);
  return chunks;
}

function buildGlossary(sourceText: string): string[] {
  const bag = new Set<string>();
  const upper = sourceText.match(/\b[A-Z][A-Za-z0-9_-]{1,24}\b/g) ?? [];
  for (const t of upper) {
    if (t.length >= 2) bag.add(t);
    if (bag.size >= 16) break;
  }
  const quoted = sourceText.match(/[“"《](.{1,18})[”"》]/g) ?? [];
  for (const raw of quoted) {
    const t = raw.replace(/[“”"《》]/g, "").trim();
    if (t) bag.add(t);
    if (bag.size >= 20) break;
  }
  return Array.from(bag).slice(0, 20);
}

async function callDoubaoChat(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  const resp = await fetch(`${params.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const hint =
      text.includes("ModelNotOpen") || text.includes("has not activated the model")
        ? "（当前账号未开通该模型，请检查 ARK_MODEL / DOUBAO_MODEL）"
        : "";
    return {
      ok: false as const,
      error: `豆包请求失败（${resp.status}）${hint}${text ? `: ${text.slice(0, 180)}` : ""}`,
    };
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) return { ok: false as const, error: "豆包未返回翻译内容" };
  return { ok: true as const, content };
}

async function enforceEnglishNoCjk(text: string): Promise<string | null> {
  const envFallback = await readFallbackEnv();
  const conf = resolveDoubaoConfig(envFallback);
  if (!conf.apiKey) return null;

  const prompt = [
    "Rewrite the following text into fluent English only.",
    "Hard rule: do not output any Chinese characters. This is mandatory.",
    "Keep paragraph breaks and meaning unchanged.",
    "Output only the rewritten English text.",
    "",
    text.slice(0, MAX_MODEL_INPUT_CHARS),
  ].join("\n");

  const res = await callDoubaoChat({
    apiKey: conf.apiKey,
    baseUrl: conf.baseUrl,
    model: conf.model,
    systemPrompt:
      "You strictly output English-only rewritten text without Chinese characters.",
    userPrompt: prompt,
  });
  return res.ok ? res.content : null;
}

async function translateByDoubaoRobust(sourceText: string, targetLanguageCode: string) {
  const envFallback = await readFallbackEnv();
  const conf = resolveDoubaoConfig(envFallback);
  if (!conf.apiKey) {
    return { ok: false as const, error: "未配置 DOUBAO_API_KEY" };
  }

  const clipped = sourceText.slice(0, MAX_MODEL_INPUT_CHARS).trim();
  const chunks = splitForTranslation(clipped);
  if (chunks.length === 0) return { ok: true as const, translatedText: "", model: conf.model };
  const glossary = buildGlossary(clipped);

  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    let done = "";
    for (let attempt = 0; attempt <= CHUNK_MAX_RETRY; attempt += 1) {
      const prompt = [
        "你是专业小说翻译编辑。",
        `将下方正文翻译为${languageLabel(targetLanguageCode)}。`,
        "必须严格遵守：",
        "1) 保留原段落结构和换行。",
        "2) 不要添加解释、注释、译者说明。",
        "3) 必须完整翻译，不允许保留原文片段。",
        targetLanguageCode === "en"
          ? "4) 英文输出中不允许出现任何中文字符。"
          : "4) 输出统一为目标语言，不混用原语言。",
        glossary.length > 0
          ? `5) 术语统一：${glossary.map((x) => `「${x}」`).join("、")}`
          : "5) 人名/组织名/术语需前后一致翻译。",
        "",
        "正文：",
        chunk,
      ].join("\n");

      const translated = await callDoubaoChat({
        apiKey: conf.apiKey,
        baseUrl: conf.baseUrl,
        model: conf.model,
        systemPrompt: "你是严格遵守规则的小说翻译助手，只输出翻译后的正文。",
        userPrompt: prompt,
      });
      if (!translated.ok) return translated;
      let candidate = translated.content;

      if (targetLanguageCode === "en" && containsCjk(candidate)) {
        const repaired = await enforceEnglishNoCjk(candidate);
        if (repaired && !containsCjk(repaired)) {
          candidate = repaired;
        }
      }
      if (targetLanguageCode === "en" && containsCjk(candidate)) {
        if (attempt < CHUNK_MAX_RETRY) continue;
        return { ok: false as const, error: "英文翻译仍含中文字符，请重试或缩短文本后重试" };
      }
      done = candidate;
      break;
    }
    if (!done) return { ok: false as const, error: "翻译失败，请稍后重试" };
    translatedChunks.push(done);
  }

  return {
    ok: true as const,
    translatedText: translatedChunks.join("\n\n"),
    model: conf.model,
  };
}

async function generateLocalizedMetadata(params: {
  translatedText: string;
  targetLanguageCode: string;
  sourceTitle: string;
}): Promise<{ title?: string; synopsis?: string; tags?: string[] } | null> {
  const envFallback = await readFallbackEnv();
  const conf = resolveDoubaoConfig(envFallback);
  if (!conf.apiKey) return null;
  const prompt = [
    "你是内容运营编辑。",
    `基于以下${languageLabel(params.targetLanguageCode)}文本生成标题、简介和标签。`,
    "规则：",
    "1) 仅输出 JSON：{\"title\":\"...\",\"synopsis\":\"...\",\"tags\":[\"tag1\",\"tag2\"]}",
    "2) title 不超过 80 字符；synopsis 80-220 字符。",
    "3) tag 不带 #，4-8 个，简短且可读。",
    "4) 必须全部使用目标语言。",
    params.targetLanguageCode === "en"
      ? "5) 英文输出（title/synopsis/tags）禁止出现任何中文字符。"
      : "5) 输出统一为目标语言，不混合中文。",
    "",
    `原始标题：${params.sourceTitle || "Untitled"}`,
    "",
    "文本：",
    params.translatedText.slice(0, 2600),
  ].join("\n");
  const res = await callDoubaoChat({
    apiKey: conf.apiKey,
    baseUrl: conf.baseUrl,
    model: conf.model,
    systemPrompt: "你是严格输出 JSON 的标签生成器。",
    userPrompt: prompt,
  });
  if (!res.ok) return null;
  const jsonText = res.content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? res.content;
  try {
    const parsed = JSON.parse(jsonText) as {
      title?: unknown;
      synopsis?: unknown;
      tags?: unknown;
    };
    const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 80) : "";
    const synopsis =
      typeof parsed.synopsis === "string" ? parsed.synopsis.trim().slice(0, 240) : "";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.replace(/^#+/, "").trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
    if (params.targetLanguageCode === "en") {
      return {
        title: containsCjk(title) ? undefined : title,
        synopsis: containsCjk(synopsis) ? undefined : synopsis,
        tags: tags.filter((t) => !containsCjk(t)),
      };
    }
    return { title, synopsis, tags };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") return badRequest("Expected object body");
  const o = body as Record<string, unknown>;

  const authorId = typeof o.authorId === "string" ? o.authorId : "";
  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }

  const subDeny = await paidMemberForbiddenResponse(wh.walletLower);
  if (subDeny) return subDeny;

  const novelId = typeof o.novelId === "string" ? o.novelId.trim() : "";
  const sourceType =
    typeof o.sourceType === "string" ? o.sourceType.trim() : "";
  const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
  const targetLanguage =
    typeof o.targetLanguage === "string" ? o.targetLanguage.trim().toLowerCase() : "";
  const manualText = typeof o.text === "string" ? o.text : "";

  if (!novelId) return badRequest("Missing novelId");
  if (!targetLanguage) return badRequest("Missing targetLanguage");
  if (!["chapter", "draft", "manual"].includes(sourceType)) {
    return badRequest("Invalid sourceType");
  }

  let sourceText = "";
  try {
    if (sourceType === "chapter") {
      if (!chapterId) return badRequest("Missing chapterId");
      sourceText = await readChapterText(wh.walletLower, novelId, chapterId);
      // 兜底：章节正文为空时，回退到草稿；草稿仍为空再回退到整本章节拼接。
      if (!sourceText.trim()) {
        sourceText = await readDraftText(wh.walletLower, novelId).catch(() => "");
      }
      if (!sourceText.trim()) {
        sourceText = await readAllChapterText(wh.walletLower, novelId).catch(() => "");
      }
    } else if (sourceType === "draft") {
      sourceText = await readDraftText(wh.walletLower, novelId);
      if (!sourceText.trim()) {
        sourceText = await readAllChapterText(wh.walletLower, novelId).catch(() => "");
      }
    } else {
      sourceText = manualText.trim();
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "读取原文失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!sourceText.trim()) return badRequest("原文内容为空，无法翻译");

  const translated = await translateByDoubaoRobust(sourceText, targetLanguage);
  if (!translated.ok) {
    return NextResponse.json({ error: translated.error }, { status: 500 });
  }

  let finalText = translated.translatedText;
  if (targetLanguage === "en" && containsCjk(finalText)) {
    const refined = await enforceEnglishNoCjk(finalText);
    if (refined && !containsCjk(refined)) {
      finalText = refined;
    }
  }
  const sourceTitle = await readNovelTitle(wh.walletLower, novelId);
  const localizedMeta = await generateLocalizedMetadata({
    translatedText: finalText,
    targetLanguageCode: targetLanguage,
    sourceTitle,
  });

  try {
    const fp = translationStorePath(wh.walletLower, novelId);
    let store: TranslationStore = {
      authorId: wh.walletLower,
      novelId,
      updatedAt: new Date().toISOString(),
      languages: {},
    };
    try {
      const raw = await fs.readFile(fp, "utf8");
      const parsed = parseLeadingJsonValue(raw) as TranslationStore;
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.authorId === wh.walletLower &&
        parsed.novelId === novelId
      ) {
        store = {
          ...parsed,
          languages:
            parsed.languages && typeof parsed.languages === "object"
              ? parsed.languages
              : {},
        };
      }
    } catch {
      // create new store below
    }

    const nowIso = new Date().toISOString();
    const langNode = {
      ...(store.languages?.[targetLanguage] ?? { updatedAt: nowIso }),
      updatedAt: nowIso,
      displayTitle:
        localizedMeta?.title && localizedMeta.title.length > 0
          ? localizedMeta.title
          : undefined,
      displaySynopsis:
        localizedMeta?.synopsis && localizedMeta.synopsis.length > 0
          ? localizedMeta.synopsis
          : undefined,
      tags:
        localizedMeta?.tags && localizedMeta.tags.length > 0
          ? localizedMeta.tags
          : undefined,
    };
    if (sourceType === "chapter" && chapterId) {
      langNode.chapters = {
        ...(langNode.chapters ?? {}),
        [chapterId]: {
          translatedText: finalText,
          updatedAt: nowIso,
        },
      };
    } else if (sourceType === "draft") {
      langNode.draftText = finalText;
    } else {
      langNode.manualText = finalText;
    }

    store.updatedAt = nowIso;
    store.languages = {
      ...(store.languages ?? {}),
      [targetLanguage]: langNode,
    };
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(store, null, 2), "utf8");
  } catch {
    // translation returned even when save failed
  }
  try {
    await trackWalletEvent({
      wallet: wh.walletLower,
      eventType: "translate",
      meta: { novelId },
    });
  } catch {
    // ignore analytics error
  }

  return NextResponse.json({
    sourceText: sourceText.slice(0, MAX_MODEL_INPUT_CHARS),
    translatedText: finalText,
    model: translated.model,
  });
}
