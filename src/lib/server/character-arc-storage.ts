import fs from "node:fs/promises";
import path from "node:path";

import { isChapterCastFilePayload } from "@/lib/chapter-cast-validate";
import { isCharacterArcMaster } from "@/lib/character-arc-validate";
import {
  CHAPTER_CAST_JSON_RE,
  chapterCastRoot,
  safePathSegment,
} from "@/lib/server/chapter-cast-storage";
import type { ChapterCastCharacter } from "@/types/chapter-cast";
import type { CharacterArcMaster, CharacterCastTimelineRow } from "@/types/character-arc";

function characterArcDir(authorLower: string, novelId: string): string {
  return path.join(
    process.cwd(),
    ".data",
    "character-arcs",
    `${authorLower}_${safePathSegment(novelId)}`,
  );
}

function arcFilePath(authorLower: string, novelId: string, stableId: string): string {
  const base = characterArcDir(authorLower, novelId);
  const fname = `${safePathSegment(stableId, 200)}.json`;
  return path.join(base, fname);
}

export async function readCharacterArcMaster(
  authorLower: string,
  novelId: string,
  stableId: string,
): Promise<CharacterArcMaster | null> {
  const fp = arcFilePath(authorLower, novelId, stableId);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isCharacterArcMaster(parsed)) return null;
    if (parsed.novelId !== novelId) return null;
    return parsed;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function writeCharacterArcMaster(
  authorLower: string,
  novelId: string,
  payload: CharacterArcMaster,
): Promise<void> {
  if (!isCharacterArcMaster(payload)) throw new Error("Invalid arc payload");
  const dir = characterArcDir(authorLower, novelId);
  await fs.mkdir(dir, { recursive: true });
  const fp = arcFilePath(authorLower, novelId, payload.stableId);
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
}

function matchesStableKey(character: ChapterCastCharacter, key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (character.stableId.trim() === k) return true;
  if (character.namePinyin.trim().toLowerCase() === k.toLowerCase()) return true;
  return false;
}

function parseVersionNum(v: string): number {
  const m = /^v(\d+)$/.exec(v);
  return m ? parseInt(m[1]!, 10) : 0;
}

/**
 * 扫描作品下全部 ch_* 目录，在各自**最新**抽取版本中查找 stableId / namePinyin 命中的条目。
 */
export async function scanCastTimelineForStableKey(
  authorLower: string,
  novelId: string,
  stableKey: string,
): Promise<CharacterCastTimelineRow[]> {
  const root = chapterCastRoot(authorLower, novelId);
  let topNames: string[];
  try {
    topNames = await fs.readdir(root);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }

  const rows: CharacterCastTimelineRow[] = [];

  for (const name of topNames) {
    if (!name.startsWith("ch_")) continue;
    const chapterBase = path.join(root, name);
    try {
      const st = await fs.stat(chapterBase);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    let vNames: string[];
    try {
      vNames = (await fs.readdir(chapterBase)).filter((n) => /^v\d+$/.test(n));
    } catch {
      continue;
    }
    if (vNames.length === 0) continue;
    vNames.sort((a, b) => parseVersionNum(a) - parseVersionNum(b));
    const lastV = vNames[vNames.length - 1]!;
    const vDir = path.join(chapterBase, lastV);
    let fnames: string[];
    try {
      fnames = await fs.readdir(vDir);
    } catch {
      continue;
    }
    for (const fname of fnames.sort()) {
      if (!CHAPTER_CAST_JSON_RE.test(fname)) continue;
      try {
        const raw = await fs.readFile(path.join(vDir, fname), "utf8");
        const parsed: unknown = JSON.parse(raw.trim());
        if (!isChapterCastFilePayload(parsed)) continue;
        if (!matchesStableKey(parsed.character, stableKey)) continue;
        rows.push({
          chapterId: parsed.chapterId,
          chapterIndex: parsed.chapterIndex,
          version: lastV,
          fileName: fname,
          extractedAt: parsed.extractedAt,
          character: parsed.character,
        });
      } catch {
        /* skip */
      }
    }
  }

  rows.sort((a, b) => a.chapterIndex - b.chapterIndex || a.chapterId.localeCompare(b.chapterId));
  return rows;
}
