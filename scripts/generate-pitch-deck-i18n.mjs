#!/usr/bin/env node
/**
 * 使用仓库 apps/web/.env.production 中的 CLAUDE_URL / CLAUDE_API / CLAUDE_MODEL_ID1，
 * 将 public/pitch-deck.html（中文）译为多种语言，输出到 public/{locale}-pitch-deck.html。
 *
 * 用法：
 *   node scripts/generate-pitch-deck-i18n.mjs
 *   node scripts/generate-pitch-deck-i18n.mjs --langs=en,ja,ko
 *
 * 需在项目根 apps/web 下执行（以便读取 public 与 .env.production）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");

/** @type {Record<string, string>} */
const DEFAULT_LANG_LABELS = {
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese (Brazil)",
  vi: "Vietnamese",
  th: "Thai",
  ar: "Arabic (Modern Standard)",
  id: "Indonesian",
  ru: "Russian",
  ms: "Malay",
  it: "Italian",
  "zh-Hant": "Traditional Chinese (Taiwan/Hong Kong literary register)",
};

function loadEnvProduction() {
  const fp = path.join(WEB_ROOT, ".env.production");
  const raw = fs.readFileSync(fp, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function getClaudeCompletionsUrl() {
  const raw = process.env.CLAUDE_URL?.trim();
  if (!raw) throw new Error(".env.production 缺少 CLAUDE_URL");
  const noComment = raw.split("#")[0].trim();
  if (noComment.includes("chat/completions")) return noComment;
  return `${noComment.replace(/\/$/, "")}/chat/completions`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} html
 * @param {string} locale BCP-47 e.g. en, ja, zh-Hant
 * @param {string} langLabel human description for the model
 */
async function translatePitchDeckHtml(html, locale, langLabel) {
  const url = getClaudeCompletionsUrl();
  const apiKey = process.env.CLAUDE_API?.trim();
  const model =
    process.env.CLAUDE_MODEL_ID1?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    "claude-sonnet-4-6";
  if (!apiKey) throw new Error(".env.production 缺少 CLAUDE_API");

  const rtlNote =
    locale === "ar"
      ? "\n- For Arabic: set <html lang=\"ar\" dir=\"rtl\"> and ensure layout remains readable."
      : "";

  const system = `You are a professional translator for investor Pitch Deck HTML.
Translate all Chinese (简体) visible copy into ${langLabel}. Rules:
- Preserve the ENTIRE document structure: <!DOCTYPE>, tags, nesting, attributes, CSS in <style>, class names, ids, slide structure, comments.
- Translate visible text nodes: headings, paragraphs, list items, table cells, button labels, fixed footer/nav copy.
- Translate <title> and aria-live text when they contain Chinese (e.g. page indicator "第一页" → appropriate phrase).
- Keep numeric superscripts like <sup class="ref">4</sup> as digits only.
- Brand name 巴别塔: use an appropriate localized convention (e.g. English "Babel Tower" or keep bilingual subtitle style consistently).
- Do NOT translate URLs in href if they are bare paths; translate link visible text only when Chinese.
- Output ONLY one complete HTML document. Do NOT wrap in markdown code fences.${rtlNote}`;

  const user = `Target locale code (for <html lang="">): ${locale}\n\nTranslate the following HTML:\n\n${html}`;

  const transient = new Set([429, 502, 503, 524]);
  let lastErr = "";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 600_000);

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          max_tokens: 32768,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(abortTimer);
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt === 3) throw new Error(lastErr);
      await sleep(600 * 2 ** attempt);
      continue;
    }
    clearTimeout(abortTimer);

    if (resp.ok) {
      const data = await resp.json();
      let content = data.choices?.[0]?.message?.content?.trim() ?? "";
      const fence = content.match(/```(?:html)?\s*([\s\S]*?)```/i);
      if (fence) content = fence[1].trim();
      if (!content.includes("<!DOCTYPE") && !content.includes("<html")) {
        throw new Error("模型返回内容不像 HTML");
      }
      if (!content.startsWith("<!DOCTYPE")) {
        const idx = content.indexOf("<!DOCTYPE");
        if (idx >= 0) content = content.slice(idx);
      }
      if (locale === "ar") {
        content = content.replace(/<html\s[^>]*>/i, `<html lang="ar" dir="rtl">`);
      } else {
        content = content.replace(/<html\s[^>]*>/i, `<html lang="${locale}">`);
      }
      return content;
    }

    const text = await resp.text().catch(() => "");
    lastErr = `HTTP ${resp.status}: ${text.slice(0, 400)}`;
    if (!transient.has(resp.status) || attempt === 3) throw new Error(lastErr);
    await sleep(600 * 2 ** attempt);
  }

  throw new Error(lastErr || "unknown failure");
}

async function main() {
  loadEnvProduction();

  const src = path.join(WEB_ROOT, "public", "pitch-deck.html");
  const html = fs.readFileSync(src, "utf8");

  const argv = process.argv.slice(2);
  const langsArg = argv.find((a) => a.startsWith("--langs="));
  let locales = langsArg
    ? langsArg
        .slice("--langs=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : Object.keys(DEFAULT_LANG_LABELS);

  for (const loc of locales) {
    const label = DEFAULT_LANG_LABELS[loc] ?? `${loc} (use standard localization)`;
    process.stdout.write(`→ ${loc} (${label}) … `);
    const outHtml = await translatePitchDeckHtml(html, loc, label);
    const outPath = path.join(WEB_ROOT, "public", `${loc}-pitch-deck.html`);
    fs.writeFileSync(outPath, outHtml, "utf8");
    console.log(`OK → public/${loc}-pitch-deck.html`);
    await sleep(1200);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
