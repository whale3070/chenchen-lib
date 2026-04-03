import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

import { getDraftFilePath } from "@/lib/draft-path";
import { trackWalletEvent } from "@/lib/server/wallet-analytics";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublishRecordLite = {
  articleId?: string;
  authorId?: string;
  novelId?: string;
  title?: string;
  synopsis?: string;
  tags?: string[];
  visibility?: "private" | "public";
  paymentMode?: "free" | "paid";
  publishedAt?: string;
  publishedChapterIds?: string[];
  firstLineIndent?: boolean;
};

type TranslationStore = {
  languages?: Record<
    string,
    {
      updatedAt?: string;
      displayTitle?: string;
      displaySynopsis?: string;
      tags?: string[];
      draftText?: string;
      manualText?: string;
      chapters?: Record<
        string,
        {
          translatedText?: string;
          updatedAt?: string;
        }
      >;
    }
  >;
};

type StructurePayload = {
  nodes?: Array<{
    id: string;
    kind: string;
    title: string;
    metadata?: {
      chapterHtml?: unknown;
      chapterHtmlDesktop?: unknown;
      chapterHtmlMobile?: unknown;
      chapterMarkdown?: unknown;
      [k: string]: unknown;
    };
  }>;
  updatedAt?: string;
};

type AuthorNovelIndex = {
  novels?: Array<{
    id?: string;
    title?: string;
  }>;
};

function makeArticleId() {
  return `art_${crypto.randomBytes(5).toString("hex")}`;
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function readerUnlockFilePath(articleId: string, walletLower: string) {
  const safeArticle = articleId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(
    process.cwd(),
    ".data",
    "reader-unlock",
    `${safeArticle}_${walletLower}.json`,
  );
}

async function readPublishRecords() {
  const dir = path.join(process.cwd(), ".data", "publish");
  const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const records: Array<{ filePath: string; data: PublishRecordLite }> = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    const filePath = path.join(dir, file.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw) as PublishRecordLite;
      // 兼容旧/异常发布记录：若缺 authorId 或 novelId，尝试从文件名回填。
      // 文件名形如 <authorLower>_<safeNovelId>.json
      if (!data.authorId || !data.novelId) {
        const base = path.basename(filePath, ".json");
        const sep = base.indexOf("_");
        if (sep > 0 && sep < base.length - 1) {
          const inferredAuthor = base.slice(0, sep).trim().toLowerCase();
          const inferredNovel = base.slice(sep + 1).trim();
          if (!data.authorId && inferredAuthor) data.authorId = inferredAuthor;
          if (!data.novelId && inferredNovel) data.novelId = inferredNovel;
        }
      }
      records.push({ filePath, data });
    } catch {
      // ignore invalid files
    }
  }
  return records;
}

async function readNovelTitle(authorId: string, novelId: string): Promise<string | null> {
  const fp = path.join(
    process.cwd(),
    ".data",
    "novels",
    "authors",
    `${authorId.toLowerCase()}.json`,
  );
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = JSON.parse(raw) as AuthorNovelIndex;
    const n = data.novels?.find((x) => x.id === novelId);
    const title = typeof n?.title === "string" ? n.title.trim() : "";
    return title || null;
  } catch {
    return null;
  }
}

function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Windows Phone/i.test(ua);
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

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

async function enforceEnglishNoCjk(text: string): Promise<string | null> {
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
    "Rewrite the following passage into fluent English only.",
    "Hard rule: do NOT output any Chinese characters.",
    "Keep original meaning and paragraph structure.",
    "Output only the rewritten English text.",
    "",
    text.slice(0, 12000),
  ].join("\n");

  const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "You only output English text without any Chinese characters.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const out = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!out) return null;
  return out;
}

function translationStorePath(authorId: string, novelId: string) {
  const safeDoc = novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(
    process.cwd(),
    ".data",
    "translations",
    `${authorId.toLowerCase()}_${safeDoc}.json`,
  );
}

async function readTranslationStore(
  authorId: string,
  novelId: string,
): Promise<TranslationStore | null> {
  try {
    const raw = await fs.readFile(translationStorePath(authorId, novelId), "utf8");
    const parsed = JSON.parse(raw) as TranslationStore;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function languageLabel(lang: string): string {
  const map: Record<string, string> = {
    zh: "中文原文",
    en: "英文区",
    ja: "日语区",
    ko: "韩语区",
    fr: "法语区",
    de: "德语区",
    es: "西语区",
    ru: "俄语区",
    pt: "葡语区",
    it: "意语区",
    vi: "越语区",
    th: "泰语区",
  };
  return map[lang] ?? `${lang.toUpperCase()} 区`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlToPlainText(html: string): string {
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

function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "<p></p>";
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function splitPlainTextParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
}

type ImagePlaceholder = {
  token: string;
  html: string;
  sourceParagraphIndex: number;
};

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function extractImagePlaceholdersWithPositions(sourceHtml: string): {
  placeholders: ImagePlaceholder[];
  sourceParagraphCount: number;
} {
  let idx = 0;
  const tokensInOrder: string[] = [];
  const imageMap = new Map<string, string>();
  const htmlWithTokens = sourceHtml.replace(/<img\b[^>]*>/gi, (img) => {
    idx += 1;
    const token = `[[IMG_${idx}]]`;
    tokensInOrder.push(token);
    imageMap.set(token, img);
    return `\n\n${token}\n\n`;
  });
  const textWithTokens = htmlToPlainText(htmlWithTokens);
  const paras = splitParagraphs(textWithTokens);
  const placeholders: ImagePlaceholder[] = [];
  for (const token of tokensInOrder) {
    const pIdx = Math.max(0, paras.findIndex((p) => p.includes(token)));
    const html = imageMap.get(token);
    if (!html) continue;
    placeholders.push({ token, html, sourceParagraphIndex: pIdx });
  }
  return { placeholders, sourceParagraphCount: Math.max(1, paras.length) };
}

function mergeImageTokensIntoTranslatedText(
  translatedText: string,
  placeholders: ImagePlaceholder[],
  sourceParagraphCount: number,
): string {
  const targetParas = splitParagraphs(translatedText);
  if (targetParas.length === 0) {
    return placeholders.map((p) => p.token).join("\n\n");
  }
  const out = targetParas.slice();
  // Keep image order and place near corresponding paragraph ratio.
  for (const ph of placeholders) {
    if (out.some((p) => p.includes(ph.token))) continue;
    const ratio = Math.min(1, Math.max(0, ph.sourceParagraphIndex / sourceParagraphCount));
    let insertAt = Math.round(ratio * Math.max(0, out.length - 1));
    insertAt = Math.min(out.length, Math.max(0, insertAt + 1));
    out.splice(insertAt, 0, ph.token);
  }
  return out.join("\n\n");
}

function plainTextToHtmlWithImages(text: string, placeholders: ImagePlaceholder[]): string {
  const imageMap = new Map(placeholders.map((p) => [p.token, p.html]));
  const paras = splitParagraphs(text);
  if (paras.length === 0) return "<p></p>";
  return paras
    .map((p) => {
      const token = p.trim();
      if (imageMap.has(token)) return imageMap.get(token) ?? "";
      return `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function buildTranslatedHtmlPreserveImages(sourceHtml: string, translatedText: string): string {
  const trimmed = translatedText.trim();
  if (!trimmed) return sourceHtml || "<p></p>";
  const { placeholders, sourceParagraphCount } = extractImagePlaceholdersWithPositions(sourceHtml);
  if (placeholders.length === 0) {
    return plainTextToHtml(trimmed);
  }
  const mergedText = mergeImageTokensIntoTranslatedText(
    trimmed,
    placeholders,
    sourceParagraphCount,
  );
  return plainTextToHtmlWithImages(mergedText, placeholders);
}

function splitTranslatedTextByChapterWeights(
  translatedText: string,
  chapterWeights: number[],
): string[] {
  const chapterCount = chapterWeights.length;
  if (chapterCount <= 0) return [];
  if (chapterCount === 1) return [translatedText.trim()];

  const paragraphs = splitPlainTextParagraphs(translatedText);
  if (paragraphs.length === 0) return new Array(chapterCount).fill("");

  const safeWeights = chapterWeights.map((w) => Math.max(1, Number.isFinite(w) ? w : 1));
  const totalWeight = safeWeights.reduce((a, b) => a + b, 0);
  const totalParas = paragraphs.length;

  // 先按权重分配每章段落数，再做余数分配，保证总和等于 totalParas。
  const rawCounts = safeWeights.map((w) => (w / totalWeight) * totalParas);
  const baseCounts = rawCounts.map((x) => Math.floor(x));
  let assigned = baseCounts.reduce((a, b) => a + b, 0);
  const remainders = rawCounts
    .map((x, idx) => ({ idx, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem);
  for (let i = 0; assigned < totalParas && i < remainders.length; i += 1) {
    baseCounts[remainders[i].idx] += 1;
    assigned += 1;
  }

  // 段落不足时，尽量保证前几章至少有内容，剩余章可为空。
  if (totalParas < chapterCount) {
    for (let i = 0; i < chapterCount; i += 1) {
      baseCounts[i] = i < totalParas ? 1 : 0;
    }
  }

  const segments: string[] = [];
  let cursor = 0;
  for (let i = 0; i < chapterCount; i += 1) {
    const count = baseCounts[i] ?? 0;
    if (count <= 0) {
      segments.push("");
      continue;
    }
    const slice = paragraphs.slice(cursor, cursor + count);
    segments.push(slice.join("\n\n").trim());
    cursor += count;
  }

  // 尾部残余段落并入最后一章，避免丢失。
  if (cursor < totalParas) {
    const remain = paragraphs.slice(cursor).join("\n\n").trim();
    const last = segments[segments.length - 1] ?? "";
    segments[segments.length - 1] = last ? `${last}\n\n${remain}` : remain;
  }
  return segments;
}

async function backfillArticleIds(
  records: Array<{ filePath: string; data: PublishRecordLite }>,
) {
  const existing = new Set<string>();
  for (const r of records) {
    if (typeof r.data.articleId === "string" && r.data.articleId.trim()) {
      existing.add(r.data.articleId.trim());
    }
  }
  for (const r of records) {
    if (typeof r.data.articleId === "string" && r.data.articleId.trim()) continue;
    let articleId = makeArticleId();
    while (existing.has(articleId)) {
      articleId = makeArticleId();
    }
    existing.add(articleId);
    r.data.articleId = articleId;
    await fs.writeFile(r.filePath, JSON.stringify(r.data, null, 2), "utf8");
  }
}

export async function GET(req: NextRequest) {
  const records = await readPublishRecords();
  await backfillArticleIds(records);

  const articleId = req.nextUrl.searchParams.get("articleId")?.trim();
  if (!articleId) {
    const publicRecords = records.filter(
      (r) =>
        r.data.visibility === "public" &&
        r.data.articleId,
    );
    const groupedItems = await Promise.all(
      publicRecords.map(async (r) => {
        const novelTitle = await readNovelTitle(r.data.authorId!, r.data.novelId!);
        const base = {
          articleId: r.data.articleId!,
          title: novelTitle || r.data.title?.trim() || "未命名作品",
          synopsis: r.data.synopsis?.trim() || "",
          publishedAt: r.data.publishedAt || "",
          language: "zh",
          languageLabel: languageLabel("zh"),
        };
        const out = [base];
        const store = await readTranslationStore(r.data.authorId!, r.data.novelId!);
        const langs = Object.entries(store?.languages ?? {});
        for (const [lang, payload] of langs) {
          if (!lang || lang === "zh") continue;
          const hasChapterTranslations =
            payload?.chapters &&
            Object.values(payload.chapters).some(
              (x) => typeof x?.translatedText === "string" && x.translatedText.trim().length > 0,
            );
          const hasDraftTranslation =
            typeof payload?.draftText === "string" && payload.draftText.trim().length > 0;
          const hasManualTranslation =
            typeof payload?.manualText === "string" && payload.manualText.trim().length > 0;
          if (!hasChapterTranslations && !hasDraftTranslation && !hasManualTranslation) continue;
          const localizedTitle =
            typeof payload?.displayTitle === "string" && payload.displayTitle.trim()
              ? payload.displayTitle.trim()
              : base.title;
          const localizedSynopsis =
            typeof payload?.displaySynopsis === "string" && payload.displaySynopsis.trim()
              ? payload.displaySynopsis.trim()
              : typeof payload?.draftText === "string" && payload.draftText.trim()
                ? payload.draftText.trim().slice(0, 220)
                : typeof payload?.manualText === "string" && payload.manualText.trim()
                  ? payload.manualText.trim().slice(0, 220)
                  : base.synopsis;
          out.push({
            ...base,
            title: localizedTitle,
            synopsis: localizedSynopsis,
            language: lang,
            languageLabel: languageLabel(lang),
          });
        }
        return out;
      }),
    );
    const items = groupedItems.flat();
    items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    return NextResponse.json({ items });
  }

  const rec = records.find(
    (r) => r.data.articleId === articleId && r.data.visibility === "public",
  );
  if (!rec || !rec.data.authorId || !rec.data.novelId) {
    return NextResponse.json({ error: "文章不存在或未公开" }, { status: 404 });
  }

  const targetLangRaw = req.nextUrl.searchParams.get("lang")?.trim().toLowerCase() ?? "zh";
  const targetLang = /^[a-z]{2,5}$/.test(targetLangRaw) ? targetLangRaw : "zh";

  const novelTitle =
    (await readNovelTitle(rec.data.authorId, rec.data.novelId)) ??
    rec.data.title?.trim() ??
    "未命名作品";
  let responseTitle = novelTitle;

  const draftPath = getDraftFilePath(
    process.cwd(),
    rec.data.authorId,
    rec.data.novelId,
  );
  let html = "";
  let updatedAt = "";
  try {
    const raw = await fs.readFile(draftPath, "utf8");
    const draft = JSON.parse(raw) as { html?: string; updatedAt?: string };
    html = draft.html ?? "";
    updatedAt = draft.updatedAt ?? "";
  } catch {
    // keep empty content if draft not found
  }

  const paymentQrPath = path.join(
    process.cwd(),
    ".data",
    "payment-qr",
    `${rec.data.authorId.toLowerCase()}_${rec.data.novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}.json`,
  );
  let paymentQrImageDataUrl: string | null = null;
  try {
    const raw = await fs.readFile(paymentQrPath, "utf8");
    const qr = JSON.parse(raw) as { imageDataUrl?: string };
    if (typeof qr.imageDataUrl === "string" && qr.imageDataUrl.trim()) {
      paymentQrImageDataUrl = qr.imageDataUrl;
    }
  } catch {
    // optional file
  }

  const safeDoc = rec.data.novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const ua = req.headers.get("user-agent") ?? "";
  const deviceOverride = req.nextUrl.searchParams.get("device");
  const preferMobile =
    deviceOverride === "mobile"
      ? true
      : deviceOverride === "desktop"
        ? false
        : isMobileUserAgent(ua);
  const structurePath = path.join(
    process.cwd(),
    ".data",
    "structure",
    `${rec.data.authorId.toLowerCase()}_${safeDoc}.json`,
  );
  type ChapterOut = {
    id: string;
    title: string;
    contentHtml: string;
    contentMarkdown?: string;
  };
  let chapters: ChapterOut[] = [];
  try {
    const raw = await fs.readFile(structurePath, "utf8");
    const structure = JSON.parse(raw) as StructurePayload;
    const chapterNodes =
      structure.nodes?.filter(
        (n) => n.kind === "chapter" && typeof n.title === "string",
      ) ?? [];
    chapters = chapterNodes.map((n) => {
      const rawHtml = preferMobile
        ? n.metadata?.chapterHtmlMobile ?? n.metadata?.chapterHtml
        : n.metadata?.chapterHtmlDesktop ?? n.metadata?.chapterHtml;
      const chapterHtml =
        typeof rawHtml === "string" && rawHtml.trim().length > 0
          ? rawHtml
          : "<p></p>";
      const rawMd = n.metadata?.chapterMarkdown;
      const chapterMarkdown =
        typeof rawMd === "string" && rawMd.trim().length > 0
          ? rawMd
          : undefined;
      const out: ChapterOut = {
        id: n.id,
        title: n.title.trim() || "未命名章节",
        contentHtml: chapterHtml,
      };
      if (chapterMarkdown) out.contentMarkdown = chapterMarkdown;
      return out;
    });
  } catch {
    // no structure data, fallback below
  }

  if (chapters.length === 0) {
    chapters = [
      {
        id: "chapter-1",
        title: "第一章",
        contentHtml: html || "<p></p>",
      },
    ];
  } else if (
    chapters.length > 0 &&
    chapters.every((c) => c.contentHtml.trim() === "<p></p>") &&
    html
  ) {
    // Backward compatibility: old draft had one full document but no per-chapter storage.
    chapters[0] = { ...chapters[0], contentHtml: html };
  }

  const publishedIds = Array.isArray(rec.data.publishedChapterIds)
    ? rec.data.publishedChapterIds
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (publishedIds.length > 0) {
    const allow = new Set(publishedIds);
    const filtered = chapters.filter((c) => allow.has(c.id));
    // 章节重切/导入后，章节 ID 可能整体重建，导致 publishedChapterIds 与当前结构失配。
    // 若完全失配，或发布记录有多章但只匹配到 1 章，也回退为当前结构章节，避免读者端只显示一章。
    const severeMismatch =
      filtered.length === 0 || (publishedIds.length > 1 && filtered.length <= 1);
    if (!severeMismatch) {
      chapters = filtered;
    }
  }

  const paymentMode = rec.data.paymentMode === "paid" ? "paid" : "free";
  const freePreviewChapters = paymentMode === "paid" ? 5 : chapters.length;
  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  const walletValid = isAddress(wallet);
  let unlocked = paymentMode === "free";
  if (paymentMode === "paid" && walletValid) {
    const fp = readerUnlockFilePath(articleId, wallet.toLowerCase());
    try {
      const raw = await fs.readFile(fp, "utf8");
      const data = JSON.parse(raw) as { unlocked?: boolean };
      unlocked = data.unlocked === true;
    } catch {
      unlocked = false;
    }
  }

  const readableChapters = unlocked
    ? chapters
    : chapters.slice(0, Math.min(freePreviewChapters, chapters.length));

  let responseSynopsis = rec.data.synopsis?.trim() || "";
  let responseChapters = readableChapters;
  if (targetLang !== "zh") {
    const store = await readTranslationStore(rec.data.authorId, rec.data.novelId);
    const langPayload = store?.languages?.[targetLang];
    if (langPayload) {
      const chapterMap = langPayload.chapters ?? {};
      const hasChapterTranslations = Object.values(chapterMap).some(
        (x) => typeof x?.translatedText === "string" && x.translatedText.trim().length > 0,
      );
      const fullBookTranslatedText =
        (typeof langPayload.draftText === "string" && langPayload.draftText.trim()) ||
        (typeof langPayload.manualText === "string" && langPayload.manualText.trim()) ||
        "";
      const nextChapters: Array<{ id: string; title: string; contentHtml: string }> = [];
      let firstTranslatedPreview = "";

      if (fullBookTranslatedText && !hasChapterTranslations) {
        const chapterWeights = readableChapters.map((chapter) =>
          Math.max(1, htmlToPlainText(chapter.contentHtml).length),
        );
        const splitTexts = splitTranslatedTextByChapterWeights(
          fullBookTranslatedText,
          chapterWeights,
        );
        for (let idx = 0; idx < readableChapters.length; idx += 1) {
          const chapter = readableChapters[idx];
          const translated = (splitTexts[idx] ?? "").trim();
          if (translated && !firstTranslatedPreview) firstTranslatedPreview = translated;
          nextChapters.push({
            ...chapter,
            contentHtml: buildTranslatedHtmlPreserveImages(chapter.contentHtml, translated),
          });
        }
        responseChapters = nextChapters;
      } else {
        for (let idx = 0; idx < readableChapters.length; idx += 1) {
          const chapter = readableChapters[idx];
          let translated = chapterMap[chapter.id]?.translatedText?.trim() ?? "";

          if (!translated && idx === 0 && typeof langPayload.draftText === "string") {
            translated = langPayload.draftText.trim();
          }

          if (
            !translated &&
            idx === 0 &&
            (!langPayload.draftText || !langPayload.draftText.trim()) &&
            typeof langPayload.manualText === "string"
          ) {
            translated = langPayload.manualText.trim();
          }

          if (translated) {
            if (!firstTranslatedPreview) firstTranslatedPreview = translated;
            nextChapters.push({
              ...chapter,
              contentHtml: buildTranslatedHtmlPreserveImages(
                chapter.contentHtml,
                translated,
              ),
            });
          } else {
            nextChapters.push(chapter);
          }
        }
        responseChapters = nextChapters;
      }

      if (typeof langPayload.draftText === "string" && langPayload.draftText.trim()) {
        responseSynopsis = langPayload.draftText.trim().slice(0, 280);
      } else if (
        typeof langPayload.manualText === "string" &&
        langPayload.manualText.trim()
      ) {
        responseSynopsis = langPayload.manualText.trim().slice(0, 280);
      } else if (firstTranslatedPreview) {
        responseSynopsis = firstTranslatedPreview.slice(0, 280);
      }
      if (
        typeof langPayload.displayTitle === "string" &&
        langPayload.displayTitle.trim().length > 0
      ) {
        responseTitle = langPayload.displayTitle.trim().slice(0, 120);
      }
      if (
        typeof langPayload.displaySynopsis === "string" &&
        langPayload.displaySynopsis.trim().length > 0
      ) {
        responseSynopsis = langPayload.displaySynopsis.trim().slice(0, 280);
      }
      if (Array.isArray(langPayload.tags) && langPayload.tags.length > 0) {
        rec.data.tags = langPayload.tags;
      } else if (targetLang === "en") {
        rec.data.tags = (rec.data.tags ?? []).filter((t) => !containsCjk(t));
      }
    }
  }

  return NextResponse.json({
    article: {
      articleId,
      authorId: rec.data.authorId,
      title: responseTitle,
      synopsis: responseSynopsis,
      tags: Array.isArray(rec.data.tags)
        ? rec.data.tags
            .filter((x): x is string => typeof x === "string")
            .map((t) => t.replace(/^#+/, "").trim())
            .filter(Boolean)
            .slice(0, 20)
        : [],
      updatedAt,
      paymentMode,
      firstLineIndent: rec.data.firstLineIndent === true,
      freePreviewChapters,
      unlocked,
      totalChapters: chapters.length,
      language: targetLang,
      languageLabel: languageLabel(targetLang),
      chapters: responseChapters.map(({ title, contentHtml, contentMarkdown }) => {
        const row: {
          title: string;
          contentHtml: string;
          contentMarkdown?: string;
        } = { title, contentHtml };
        if (typeof contentMarkdown === "string" && contentMarkdown.trim()) {
          row.contentMarkdown = contentMarkdown;
        }
        return row;
      }),
      paymentQrImageDataUrl,
    },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!body || typeof body !== "object") {
    return badRequest("Expected object body");
  }
  const b = body as Record<string, unknown>;
  const articleId = typeof b.articleId === "string" ? b.articleId.trim() : "";
  if (!articleId) return badRequest("Missing articleId");

  const wallet = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(wallet)) {
    return unauthorized("请先连接钱包后再支付解锁");
  }

  const records = await readPublishRecords();
  const rec = records.find(
    (r) => r.data.articleId === articleId && r.data.visibility === "public",
  );
  if (!rec) return NextResponse.json({ error: "文章不存在或未公开" }, { status: 404 });
  if (rec.data.paymentMode !== "paid") {
    return NextResponse.json({ ok: true, unlocked: true });
  }

  const fp = readerUnlockFilePath(articleId, wallet.toLowerCase());
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(
    fp,
    JSON.stringify(
      {
        articleId,
        wallet: wallet.toLowerCase(),
        unlocked: true,
        paidAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  try {
    await trackWalletEvent({
      wallet: wallet.toLowerCase(),
      eventType: "reader_unlock",
      meta: { articleId },
    });
  } catch {
    // ignore analytics error
  }
  return NextResponse.json({ ok: true, unlocked: true });
}
