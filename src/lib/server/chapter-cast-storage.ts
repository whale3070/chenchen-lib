import fs from "node:fs/promises";
import path from "node:path";

import { isChapterCastFilePayload } from "@/lib/chapter-cast-validate";
import type { ChapterCastCharacter, ChapterCastFilePayload } from "@/types/chapter-cast";

export function safePathSegment(id: string, max = 96): string {
  const s = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, max);
  return s || "x";
}

export function chapterCastRoot(authorLower: string, novelId: string): string {
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    ".data",
    "chapter-casts",
    `${authorLower}_${safePathSegment(novelId)}`,
  );
}

export function chapterCastChapterDir(
  authorLower: string,
  novelId: string,
  chapterId: string,
): string {
  return path.join(chapterCastRoot(authorLower, novelId), `ch_${safePathSegment(chapterId)}`);
}

/** 扫描 ch_* 下 v1、v2… 返回下一个版本目录名 */
export async function nextChapterCastVersionDir(
  authorLower: string,
  novelId: string,
  chapterId: string,
): Promise<string> {
  const base = chapterCastChapterDir(authorLower, novelId, chapterId);
  let max = 0;
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const m = /^v(\d+)$/.exec(e.name);
      if (m) max = Math.max(max, parseInt(m[1]!, 10));
    }
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "ENOENT") throw err;
  }
  return `v${max + 1}`;
}

function sanitizeNamePinyin(raw: string, fallbackSeed: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
  if (s.length > 0) return s;
  let h = 0;
  for (let i = 0; i < fallbackSeed.length; i++) {
    h = (h * 31 + fallbackSeed.charCodeAt(i)) >>> 0;
  }
  return `c${h.toString(16).slice(0, 10)}`;
}

export function buildChapterCastFilename(
  chapterIndex: number,
  namePinyin: string,
  name: string,
  used: Set<string>,
): string {
  const base = sanitizeNamePinyin(namePinyin, name);
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}_${n}`;
    n += 1;
  }
  used.add(slug);
  const idx = Math.max(1, Math.floor(chapterIndex));
  return `chapter${idx}_${slug}.json`;
}

export async function writeChapterCastVersion(
  authorLower: string,
  novelId: string,
  chapterId: string,
  chapterIndex: number,
  versionDir: string,
  characters: ChapterCastCharacter[],
  extractedAt: string,
): Promise<string[]> {
  const dir = path.join(chapterCastChapterDir(authorLower, novelId, chapterId), versionDir);
  await fs.mkdir(dir, { recursive: true });
  const used = new Set<string>();
  const written: string[] = [];
  for (const ch of characters) {
    const fname = buildChapterCastFilename(chapterIndex, ch.namePinyin, ch.name, used);
    const payload: ChapterCastFilePayload = {
      schemaVersion: 1,
      novelId,
      chapterId,
      chapterIndex,
      extractVersion: versionDir,
      extractedAt,
      character: ch,
    };
    await fs.writeFile(path.join(dir, fname), JSON.stringify(payload, null, 2), "utf8");
    written.push(fname);
  }
  return written;
}

export async function listChapterCastVersions(
  authorLower: string,
  novelId: string,
  chapterId: string,
): Promise<string[]> {
  const base = chapterCastChapterDir(authorLower, novelId, chapterId);
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && /^v\d+$/.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => {
        const na = parseInt(/^v(\d+)$/.exec(a)![1]!, 10);
        const nb = parseInt(/^v(\d+)$/.exec(b)![1]!, 10);
        return na - nb;
      });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw err;
  }
}

export const CHAPTER_CAST_JSON_RE = /^chapter\d+_[a-z0-9_]+\.json$/i;

export async function readChapterCastVersionFiles(
  authorLower: string,
  novelId: string,
  chapterId: string,
  versionDir: string,
): Promise<Array<{ fileName: string; payload: ChapterCastFilePayload }>> {
  if (!/^v\d+$/.test(versionDir)) return [];
  const dir = path.join(chapterCastChapterDir(authorLower, novelId, chapterId), versionDir);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw err;
  }
  const out: Array<{ fileName: string; payload: ChapterCastFilePayload }> = [];
  for (const name of names.sort()) {
    if (!CHAPTER_CAST_JSON_RE.test(name)) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const parsed: unknown = JSON.parse(trimmed);
      if (!isChapterCastFilePayload(parsed)) continue;
      out.push({ fileName: name, payload: parsed });
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function writeChapterCastFile(
  authorLower: string,
  novelId: string,
  chapterId: string,
  versionDir: string,
  fileName: string,
  payload: ChapterCastFilePayload,
): Promise<void> {
  if (!/^v\d+$/.test(versionDir)) throw new Error("Invalid version");
  if (!CHAPTER_CAST_JSON_RE.test(fileName)) throw new Error("Invalid file name");
  if (!isChapterCastFilePayload(payload)) throw new Error("Invalid payload");
  const dir = path.join(chapterCastChapterDir(authorLower, novelId, chapterId), versionDir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), JSON.stringify(payload, null, 2), "utf8");
}

export async function deleteChapterCastFile(
  authorLower: string,
  novelId: string,
  chapterId: string,
  versionDir: string,
  fileName: string,
): Promise<void> {
  if (!/^v\d+$/.test(versionDir)) throw new Error("Invalid version");
  if (!CHAPTER_CAST_JSON_RE.test(fileName)) throw new Error("Invalid file name");
  const fp = path.join(
    chapterCastChapterDir(authorLower, novelId, chapterId),
    versionDir,
    fileName,
  );
  await fs.unlink(fp);
}
