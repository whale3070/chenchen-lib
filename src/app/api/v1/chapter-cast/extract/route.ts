import { isAddress } from "viem";

import { callDeepSeekChat } from "@/lib/server/deepseek-chat";
import { paidMemberForbiddenResponse } from "@/lib/server/paid-membership";
import {
  nextChapterCastVersionDir,
  safePathSegment,
  writeChapterCastVersion,
} from "@/lib/server/chapter-cast-storage";
import { stripHtmlForCount } from "@/lib/text-count";
import type { ChapterCastCharacter } from "@/types/chapter-cast";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const MAX_CHAPTER_CHARS = 14_000;

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

function parseWalletHeader(req: NextRequest):
  | { ok: true; walletLower: string }
  | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: safeAuthorId(headerAddr) };
}

function chapterPlainFromHtml(html: string): string {
  return stripHtmlForCount(html).replace(/\s+/g, " ").trim();
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] ?? text).trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return source.slice(start, end + 1);
}

function isValidNamePinyin(s: unknown): s is string {
  return typeof s === "string" && /^[a-z0-9]{1,48}$/.test(s);
}

function parseCharacters(raw: unknown): ChapterCastCharacter[] | null {
  if (!raw || typeof raw !== "object") return null;
  const arr = (raw as { characters?: unknown }).characters;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (arr.length > 80) return null;
  const out: ChapterCastCharacter[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name || name.length > 64) return null;
    const pyMain =
      typeof o.namePinyin === "string" ? o.namePinyin.trim().toLowerCase() : "";
    const pyAlt =
      typeof o.name_pinyin === "string" ? o.name_pinyin.trim().toLowerCase() : "";
    const namePinyin = isValidNamePinyin(pyMain)
      ? pyMain
      : isValidNamePinyin(pyAlt)
        ? pyAlt
        : "";
    if (!namePinyin) return null;
    const stableFromModel =
      typeof o.stableId === "string" ? o.stableId.trim().slice(0, 200) : "";
    const ch: ChapterCastCharacter = {
      stableId: stableFromModel || "",
      name,
      namePinyin,
      age: typeof o.age === "string" ? o.age.trim().slice(0, 64) : undefined,
      appearance:
        typeof o.appearance === "string"
          ? o.appearance.trim().slice(0, 2000)
          : undefined,
      personality:
        typeof o.personality === "string"
          ? o.personality.trim().slice(0, 2000)
          : undefined,
      location:
        typeof o.location === "string" ? o.location.trim().slice(0, 500) : undefined,
      presence:
        typeof o.presence === "string" ? o.presence.trim().slice(0, 1000) : undefined,
      notes: typeof o.notes === "string" ? o.notes.trim().slice(0, 2000) : undefined,
    };
    out.push(ch);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const deny = await paidMemberForbiddenResponse(wh.walletLower);
  if (deny) return deny;

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
  const chapterId = typeof o.chapterId === "string" ? o.chapterId.trim() : "";
  const chapterIndex =
    typeof o.chapterIndex === "number" && Number.isFinite(o.chapterIndex)
      ? Math.floor(o.chapterIndex)
      : typeof o.chapterIndex === "string"
        ? parseInt(o.chapterIndex, 10)
        : NaN;
  const chapterHtml = typeof o.chapterHtml === "string" ? o.chapterHtml : "";

  if (!isAddress(authorId)) return badRequest("Invalid authorId");
  if (safeAuthorId(authorId) !== wh.walletLower) {
    return forbidden("authorId 必须与 x-wallet-address 一致");
  }
  if (!novelId) return badRequest("Missing novelId");
  if (!chapterId) return badRequest("Missing chapterId");
  if (!Number.isFinite(chapterIndex) || chapterIndex < 1) {
    return badRequest("Invalid chapterIndex（须为从 1 起的章节序号）");
  }

  const plain = chapterPlainFromHtml(chapterHtml);
  if (!plain) return badRequest("章节正文为空，无法抽取登场人物");

  const excerpt = plain.slice(0, MAX_CHAPTER_CHARS);

  const system = [
    "你是中文小说编辑助手，只做结构化信息抽取。",
    "规则：",
    "1) 「登场」指叙事中该人物实际在场、出场参与场景，不包括仅在对话里被他人提到但未出场的情况。",
    "2) 输出必须是单个 JSON 对象，且顶层键为 characters，值为数组。",
    "3) 每个元素字段：name（中文名）, namePinyin（全小写拼音，仅 a-z0-9，用于文件名，无空格）, age, appearance, personality, location, presence（本章登场/戏份一句）, notes（可选）。",
    "4) stableId 可选；若省略则由服务端生成。",
    "5) 不要输出 JSON 以外的任何文字。",
  ].join("\n");

  const user = [
    `章节序号（供参考）：第 ${chapterIndex} 章`,
    "",
    "以下为章节正文（可能已截断）：",
    excerpt,
  ].join("\n");

  let raw: string;
  try {
    raw = await callDeepSeekChat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 请求失败";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return NextResponse.json(
      { error: "AI 返回无法解析为 JSON", rawPreview: raw.slice(0, 400) },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return NextResponse.json({ error: "JSON 解析失败" }, { status: 502 });
  }

  const characters = parseCharacters(parsed);
  if (!characters || characters.length === 0) {
    return NextResponse.json(
      { error: "未识别到登场人物，或字段不符合要求（每人须有 name 与 namePinyin）" },
      { status: 422 },
    );
  }

  const novelSeg = safePathSegment(novelId);
  const chapterSeg = safePathSegment(chapterId);
  const extractedAt = new Date().toISOString();

  for (const ch of characters) {
    if (!ch.stableId) {
      ch.stableId = `${novelSeg}_${chapterSeg}_${ch.namePinyin}`;
    }
  }

  const versionDir = await nextChapterCastVersionDir(
    wh.walletLower,
    novelId,
    chapterId,
  );

  const files = await writeChapterCastVersion(
    wh.walletLower,
    novelId,
    chapterId,
    chapterIndex,
    versionDir,
    characters,
    extractedAt,
  );

  return NextResponse.json({
    ok: true,
    version: versionDir,
    files,
    count: files.length,
  });
}
