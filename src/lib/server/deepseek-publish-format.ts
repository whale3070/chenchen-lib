import fs from "node:fs/promises";
import path from "node:path";

import { writeChapterContentDisk } from "@/lib/server/chapter-content-fs";

type StructurePayload = {
  nodes?: Array<{
    id: string;
    kind: string;
    title: string;
    metadata?: Record<string, unknown>;
  }>;
  updatedAt?: string;
};

const MAX_MODEL_INPUT_CHARS = 12000;
type DeviceProfile = "desktop" | "mobile";
type ImagePlaceholder = { token: string; html: string };

/** 补充说明里明确不要首行缩进时，避免后处理再强行加「　　」 */
function authorRequestsNoFirstLineIndent(authorPrompt: string | undefined): boolean {
  const t = authorPrompt?.trim() ?? "";
  if (!t) return false;
  return /(?:不要|取消|去掉|无需|禁用).{0,8}首行.{0,6}缩进|无首行缩进|不要.{0,6}段首.{0,4}缩进|段首不缩进|段首无缩进|取消段首|不要\s*　{2}|不适用首行缩进/i.test(
    t,
  );
}

function isImageToken(text: string): boolean {
  return /^\[\[IMG_\d+\]\]$/.test(text.trim());
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
  const safeDoc = novelId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(process.cwd(), ".data", "structure", `${authorLower}_${safeDoc}.json`);
}

function decodeHtmlEntity(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntity(
    html
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n\n")
      .replace(/<li>/gi, " - ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractImagePlaceholders(html: string): {
  htmlWithTokens: string;
  placeholders: ImagePlaceholder[];
} {
  const placeholders: ImagePlaceholder[] = [];
  let idx = 0;
  /** 整块 figure（常见 TipTap 图片块），避免只抽 img 留下空壳 figure */
  const htmlWithTokens = html
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, (block) => {
      if (!/<img\b/i.test(block)) return block;
      idx += 1;
      const token = `[[IMG_${idx}]]`;
      placeholders.push({ token, html: block });
      return `\n\n${token}\n\n`;
    })
    .replace(/<img\b[^>]*>/gi, (img) => {
      idx += 1;
      const token = `[[IMG_${idx}]]`;
      placeholders.push({ token, html: img });
      return `\n\n${token}\n\n`;
    });
  return { htmlWithTokens, placeholders };
}

function ensureImageTokensPresent(text: string, tokens: string[]): string {
  if (!text.trim()) {
    return tokens.join("\n\n");
  }
  let out = text;
  for (const token of tokens) {
    if (!out.includes(token)) {
      out += `\n\n${token}`;
    }
  }
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureFirstLineIndent(paragraph: string, enabled: boolean): string {
  const content = paragraph.trim();
  if (!content) return "";
  if (isImageToken(content)) return content;
  const stripped = content.replace(/^[\u3000 ]{1,4}/, "");
  if (!enabled) return stripped;
  return `　　${stripped}`;
}

function splitLongParagraph(text: string, profile: DeviceProfile): string[] {
  const src = text.trim();
  if (!src) return [];
  if (isImageToken(src)) return [src];
  const hardLimit = profile === "mobile" ? 90 : 160;
  const splitStep = profile === "mobile" ? 58 : 90;
  const minLen = profile === "mobile" ? 20 : 40;
  const softMax = profile === "mobile" ? 82 : 130;
  if (src.length <= hardLimit) return [src];
  const breaks: number[] = [];
  for (let i = minLen; i < src.length; i += 1) {
    const ch = src[i];
    if ("。！？；".includes(ch)) breaks.push(i + 1);
  }
  if (breaks.length === 0) {
    const out: string[] = [];
    for (let i = 0; i < src.length; i += splitStep) out.push(src.slice(i, i + splitStep));
    return out;
  }
  const out: string[] = [];
  let start = 0;
  for (const b of breaks) {
    const len = b - start;
    if (len < minLen) continue;
    if (len > softMax && out.length < 4) {
      const mid = Math.floor((start + b) / 2);
      out.push(src.slice(start, mid));
      out.push(src.slice(mid, b));
    } else {
      out.push(src.slice(start, b));
    }
    start = b;
  }
  if (start < src.length) out.push(src.slice(start));
  return out.filter(Boolean);
}

function fallbackFormatPlainText(
  text: string,
  profile: DeviceProfile,
  firstLineIndent: boolean,
): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";
  const rawParas = normalized
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of rawParas) {
    const parts = splitLongParagraph(p, profile);
    if (parts.length === 0) continue;
    for (const item of parts) {
      out.push(ensureFirstLineIndent(item, firstLineIndent));
    }
  }
  return out.join("\n\n");
}

function reflowForProfile(
  text: string,
  profile: DeviceProfile,
  firstLineIndent: boolean,
): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";
  const paras = normalized
    .split(/\n{2,}/)
    .map((x) => x.replace(/^[\u3000 ]{1,4}/, "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    const parts = splitLongParagraph(p, profile);
    for (const item of parts) out.push(ensureFirstLineIndent(item, firstLineIndent));
  }
  return out.join("\n\n");
}

function plainTextToHtml(
  text: string,
  placeholders: ImagePlaceholder[] = [],
  firstLineIndent = true,
): string {
  const imageMap = new Map(placeholders.map((p) => [p.token, p.html]));
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "<p></p>";
  const blocks = normalized
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "<p></p>";

  const tokenRe = /\[\[IMG_\d+\]\]/g;
  const pieces: string[] = [];

  for (const block of blocks) {
    tokenRe.lastIndex = 0;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let foundToken = false;
    while ((m = tokenRe.exec(block)) !== null) {
      foundToken = true;
      const before = block.slice(lastIdx, m.index).trim();
      if (before) {
        pieces.push(
          `<p>${escapeHtml(ensureFirstLineIndent(before, firstLineIndent)).replace(/\n/g, "<br>")}</p>`,
        );
      }
      pieces.push(imageMap.get(m[0]) ?? "");
      lastIdx = m.index + m[0].length;
    }
    const tail = block.slice(lastIdx).trim();
    if (tail) {
      pieces.push(
        `<p>${escapeHtml(ensureFirstLineIndent(tail, firstLineIndent)).replace(/\n/g, "<br>")}</p>`,
      );
    } else if (!foundToken) {
      pieces.push(
        `<p>${escapeHtml(ensureFirstLineIndent(block, firstLineIndent)).replace(/\n/g, "<br>")}</p>`,
      );
    }
  }

  const joined = pieces.filter(Boolean).join("");
  return joined || "<p></p>";
}

/** 模型偶发把占位符改成全角括号等，尽量修回可识别的 [[IMG_n]] */
function repairImageTokensInAiOutput(text: string, imageTokens: string[]): string {
  let out = text;
  for (const token of imageTokens) {
    const m = token.match(/^\[\[IMG_(\d+)\]\]$/);
    if (!m) continue;
    const num = m[1];
    const wrong = [
      new RegExp(`【\\s*IMG_\\s*${num}\\s*】`, "gi"),
      new RegExp(`［［\\s*IMG_\\s*${num}\\s*］］`, "g"),
      new RegExp(`\\[IMG_\\s*${num}\\s*\\](?!\\])`, "gi"),
    ];
    for (const p of wrong) {
      out = out.replace(p, token);
    }
  }
  return out;
}

type DeepseekFormatResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

async function formatByDeepSeek(
  rawText: string,
  imageTokens: string[],
  authorPrompt: string | undefined,
  opts: { firstLineIndent: boolean },
): Promise<DeepseekFormatResult> {
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
    return {
      ok: false,
      error:
        "未配置 API Key：请在运行 AI 排版 worker 的环境中设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY。",
    };
  }

  const text = rawText.slice(0, MAX_MODEL_INPUT_CHARS).trim();
  if (!text) return { ok: true, text: "" };

  const indentRule = opts.firstLineIndent
    ? "1) 段首缩进：每个自然段首行使用两个全角空格（“　　”）作为缩进，除非下文「作者补充说明」明确要求不要此类缩进。"
    : "1) 段首缩进：不要系统性添加两个全角空格（“　　”）作为段首规范；若作者补充说明明确要求传统首行缩进，再按作者要求处理。";

  const authorBlock =
    authorPrompt && authorPrompt.trim()
      ? [
          "",
          "【作者补充说明（优先落实）】",
          "在不改变事实情节、人物关系、专有名词与图片占位符的前提下，作者对分段、对话分行、空行、标点、缩进、引号风格等的说明**必须体现在输出正文里**；不得以“默认规范”为由忽略，除非该说明试图改写剧情、替换专有名词或删除/改写图片占位符。",
          "",
          authorPrompt.trim(),
          "",
          "请再次自检：上述作者补充是否已在正文排版中落实（仅限版式层面）。",
        ]
      : [];

  const prompt = [
    "你是“中文长篇小说出版排版编辑”。请对输入稿件做“仅排版与微润色”，目标是提升可读性与出版观感。",
    "",
    "【核心原则（不可违背）】",
    "1) 严禁改剧情：不得新增/删除关键情节、人物、设定、时间线、世界观。",
    "2) 严禁改人名地名术语：专有名词保持原样。",
    "3) 仅做排版与轻微语言整理：断句、分段、标点、重复赘词清理。",
    imageTokens.length > 0
      ? `4) 输入中若出现图片占位符（如 ${imageTokens[0]}），必须逐字原样保留，不得删除、改写、合并。`
      : "4) 若无图片占位符，按普通文本处理。",
    "",
    "【默认排版规范（与作者补充说明不冲突时执行；若作者仅对版式/标点/分段提出不同要求，以作者补充说明为准）】",
    indentRule,
    "2) 过长段落必须拆分：",
    "   - 单段超过 140 个汉字时，按语义拆成 2-4 段；",
    "   - 目标段长 40-110 字，叙事高密段可适当放宽到 130 字。",
    "3) 对话独立成段：",
    "   - 不同角色发言必须分段；",
    "   - 同一角色长段台词可按语气停顿拆段；",
    "   - 对话与动作描写混合时，优先“台词段/动作段”分开。",
    "4) 场景切换（时间/地点/视角明显变化）前后空一行，不额外加标题。",
    "5) 标点规范化：统一中文全角标点，修正常见误用（逗号、句号、冒号、引号、省略号等）。",
    "6) 删除明显口水句、重复连接词、机械重复表达，但不得改变语义。",
    "7) 保留原文段落顺序，不重排章节结构。",
    ...authorBlock,
    "",
    "【输出要求（必须遵守）】",
    "1) 只输出排版后的正文，不要解释、不要备注、不要Markdown标记。",
    "2) 不要添加“以下是排版结果”等引导语。",
    "3) 不要输出JSON，不要代码块。",
    "4) 若输入为空，输出：内容为空。",
    "",
    "现在开始处理下面的小说正文：",
    text,
  ].join("\n");

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
        {
          role: "system",
          content:
            "你是中文小说出版排版编辑。作者会在用户消息中给出「作者补充说明」：凡属于版式、分段、标点、缩进、对话分行等要求，在不改变剧情与专有名词的前提下必须落实，不得以默认模板覆盖作者意图。",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.text()).trim().slice(0, 280);
    } catch {
      detail = "";
    }
    const statusLine = `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
    const msg = detail
      ? `排版 API 请求失败（${statusLine}）：${detail}`
      : `排版 API 请求失败（${statusLine}）。`;
    return { ok: false, error: msg.slice(0, 500) };
  }
  let data: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: unknown;
  } | null = null;
  try {
    data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: unknown;
    };
  } catch {
    return { ok: false, error: "排版 API 响应不是合法 JSON。" };
  }
  const rawErr = data?.error;
  const apiErrMsg =
    typeof rawErr === "string"
      ? rawErr.trim()
      : rawErr && typeof rawErr === "object" && "message" in rawErr
        ? String((rawErr as { message?: unknown }).message ?? "").trim()
        : "";
  if (apiErrMsg) {
    return { ok: false, error: `排版 API 返回错误：${apiErrMsg.slice(0, 400)}` };
  }
  const output = data?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!output || output === "内容为空") {
    return {
      ok: false,
      error: "排版 API 返回空正文（无 choices[0].message.content，或模型输出为空）。",
    };
  }
  return { ok: true, text: output };
}

export type AutoFormatChaptersForPublishResult = {
  formattedCount: number;
  /** 模型调用失败原因，供写入 publish.aiReflowError */
  apiError?: string;
};

export async function autoFormatChaptersForPublish(params: {
  authorLower: string;
  novelId: string;
  chapterIds?: string[];
  /** 来自发布配置的 AI 排版补充说明 */
  authorPrompt?: string;
  /** 与阅读页一致；为 false 时模型与后处理均不强行段首「　　」 */
  firstLineIndent?: boolean;
}): Promise<AutoFormatChaptersForPublishResult> {
  const fp = structurePath(params.authorLower, params.novelId);
  let raw: string;
  try {
    raw = await fs.readFile(fp, "utf8");
  } catch {
    return { formattedCount: 0 };
  }
  let structure: StructurePayload;
  try {
    structure = JSON.parse(raw) as StructurePayload;
  } catch {
    return { formattedCount: 0 };
  }
  const nodes = Array.isArray(structure.nodes) ? structure.nodes : [];
  const targets =
    params.chapterIds && params.chapterIds.length > 0
      ? new Set(params.chapterIds)
      : null;

  const firstLineIndent =
    params.firstLineIndent !== false && !authorRequestsNoFirstLineIndent(params.authorPrompt);

  let changed = 0;
  const nextNodes = [...nodes];
  for (let i = 0; i < nextNodes.length; i += 1) {
    const node = nextNodes[i];
    if (node.kind !== "chapter") continue;
    if (targets && !targets.has(node.id)) continue;
    const chapterHtmlRaw = node.metadata?.chapterHtml;
    const chapterHtml =
      typeof chapterHtmlRaw === "string" && chapterHtmlRaw.trim().length > 0
        ? chapterHtmlRaw
        : "<p></p>";
    const { htmlWithTokens, placeholders } = extractImagePlaceholders(chapterHtml);
    const imageTokens = placeholders.map((x) => x.token);
    const text = htmlToPlainText(htmlWithTokens);
    if (!text) continue;
    const ai = await formatByDeepSeek(text, imageTokens, params.authorPrompt, {
      firstLineIndent,
    });
    if (!ai.ok) {
      const titleHint =
        typeof node.title === "string" && node.title.trim()
          ? `「${node.title.trim()}」`
          : `id=${node.id}`;
      return {
        formattedCount: 0,
        apiError: `AI 排版中断：章节 ${titleHint} — ${ai.error}`.slice(0, 500),
      };
    }
    let formatted = ai.text;
    formatted = repairImageTokensInAiOutput(formatted, imageTokens);
    formatted = ensureImageTokensPresent(formatted, imageTokens);
    const desktopText = reflowForProfile(formatted, "desktop", firstLineIndent);
    const mobileText = reflowForProfile(formatted, "mobile", firstLineIndent);
    const htmlDesktop = plainTextToHtml(desktopText, placeholders, firstLineIndent);
    const htmlMobile = plainTextToHtml(mobileText, placeholders, firstLineIndent);
    const prevMeta = (node.metadata ?? {}) as Record<string, unknown>;
    const bodySource =
      prevMeta.chapterBodySource === "markdown" || prevMeta.chapterBodySource === "richtext"
        ? prevMeta.chapterBodySource
        : undefined;
    const chapterMarkdown =
      typeof prevMeta.chapterMarkdown === "string" ? prevMeta.chapterMarkdown : undefined;
    await writeChapterContentDisk({
      authorLower: params.authorLower,
      novelId: params.novelId,
      chapterId: node.id,
      payload: {
        ...(bodySource ? { chapterBodySource: bodySource } : {}),
        ...(chapterMarkdown !== undefined ? { chapterMarkdown } : {}),
        chapterHtml: htmlDesktop,
        chapterHtmlDesktop: htmlDesktop,
        chapterHtmlMobile: htmlMobile,
      },
    });
    const metadata = {
      ...(node.metadata ?? {}),
      chapterHtml: htmlDesktop,
      chapterHtmlDesktop: htmlDesktop,
      chapterHtmlMobile: htmlMobile,
    };
    nextNodes[i] = { ...node, metadata };
    changed += 1;
  }

  if (changed > 0) {
    const payload: StructurePayload = {
      ...structure,
      nodes: nextNodes,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
  }
  return { formattedCount: changed };
}
