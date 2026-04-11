import type { ChapterCastCharacter, ChapterCastFilePayload } from "@/types/chapter-cast";

function isNonEmptyString(x: unknown, max: number): x is string {
  return typeof x === "string" && x.trim().length > 0 && x.length <= max;
}

function isOptionalString(x: unknown, max: number): boolean {
  if (x === undefined || x === null) return true;
  return typeof x === "string" && x.length <= max;
}

function isValidNamePinyin(s: unknown): s is string {
  return typeof s === "string" && /^[a-z0-9]{1,48}$/.test(s);
}

export function isChapterCastCharacter(x: unknown): x is ChapterCastCharacter {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (!isNonEmptyString(o.name, 64)) return false;
  if (!isValidNamePinyin(o.namePinyin)) return false;
  if (!isNonEmptyString(o.stableId, 512)) return false;
  if (!isOptionalString(o.age, 64)) return false;
  if (!isOptionalString(o.appearance, 2000)) return false;
  if (!isOptionalString(o.personality, 2000)) return false;
  if (!isOptionalString(o.location, 500)) return false;
  if (!isOptionalString(o.presence, 1000)) return false;
  if (!isOptionalString(o.notes, 2000)) return false;
  return true;
}

export function isChapterCastFilePayload(x: unknown): x is ChapterCastFilePayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.schemaVersion !== 1) return false;
  if (!isNonEmptyString(o.novelId, 200)) return false;
  if (!isNonEmptyString(o.chapterId, 200)) return false;
  if (typeof o.chapterIndex !== "number" || !Number.isFinite(o.chapterIndex) || o.chapterIndex < 1) {
    return false;
  }
  if (typeof o.extractVersion !== "string" || !/^v\d+$/.test(o.extractVersion)) return false;
  if (!isNonEmptyString(o.extractedAt, 50)) return false;
  return isChapterCastCharacter(o.character);
}
