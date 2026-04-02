import fs from "node:fs/promises";
import path from "node:path";

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
  const htmlWithTokens = html.replace(/<img\b[^>]*>/gi, (img) => {
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

function ensureFirstLineIndent(paragraph: string): string {
  const content = paragraph.trim();
  if (!content) return "";
  if (isImageToken(content)) return content;
  const stripped = content.replace(/^[\u3000 ]{1,4}/, "");
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

function fallbackFormatPlainText(text: string, profile: DeviceProfile): string {
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
      out.push(ensureFirstLineIndent(item));
    }
  }
  return out.join("\n\n");
}

function reflowForProfile(text: string, profile: DeviceProfile): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";
  const paras = normalized
    .split(/\n{2,}/)
    .map((x) => x.replace(/^[\u3000 ]{1,4}/, "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    const parts = splitLongParagraph(p, profile);
    for (const item of parts) out.push(ensureFirstLineIndent(item));
  }
  return out.join("\n\n");
}

function plainTextToHtml(text: string, placeholders: ImagePlaceholder[] = []): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "<p></p>";
  const paragraphs = normalized.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  if (paragraphs.length === 0) return "<p></p>";
  const imageMap = new Map(placeholders.map((p) => [p.token, p.html]));
  return paragraphs
    .map((p) => {
      const token = p.trim();
      if (isImageToken(token)) {
        return imageMap.get(token) ?? "";
      }
      return `<p>${escapeHtml(ensureFirstLineIndent(p)).replace(/\n/g, "<br>")}</p>`;
    })
    .filter(Boolean)
    .join("");
}

async function formatByDeepSeek(
  rawText: string,
  imageTokens: string[],
): Promise<string | null> {
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

  const text = rawText.slice(0, MAX_MODEL_INPUT_CHARS).trim();
  if (!text) return "";

  const prompt = [
    "你是“中文长篇小说出版排版编辑”。请对输入稿件做“仅排版与微润色”，目标是提升可读性与出版观感。",
    "",
    "【核心原则】",
    "1) 严禁改剧情：不得新增/删除关键情节、人物、设定、时间线、世界观。",
    "2) 严禁改人名地名术语：专有名词保持原样。",
    "3) 仅做排版与轻微语言整理：断句、分段、标点、重复赘词清理。",
    imageTokens.length > 0
      ? `4) 输入中若出现图片占位符（如 ${imageTokens[0]}），必须逐字原样保留，不得删除、改写、合并。`
      : "4) 若无图片占位符，按普通文本处理。",
    "",
    "【排版规则（必须执行）】",
    "1) 每个自然段首行缩进两个全角空格（即“　　”）。",
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
        { role: "system", content: "你是严格遵守规则的中文小说出版排版编辑。" },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) return null;
  let data: {
    choices?: Array<{ message?: { content?: string } }>;
  } | null = null;
  try {
    data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch {
    return null;
  }
  const output = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!output || output === "内容为空") return "";
  return output;
}

export async function autoFormatChaptersForPublish(params: {
  authorLower: string;
  novelId: string;
  chapterIds?: string[];
}) {
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
    let formatted = await formatByDeepSeek(text, imageTokens);
    if (formatted === null) {
      formatted = fallbackFormatPlainText(text, "desktop");
    }
    formatted = ensureImageTokensPresent(formatted, imageTokens);
    const desktopText = reflowForProfile(formatted, "desktop");
    const mobileText = reflowForProfile(formatted, "mobile");
    const htmlDesktop = plainTextToHtml(desktopText, placeholders);
    const htmlMobile = plainTextToHtml(mobileText, placeholders);
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
