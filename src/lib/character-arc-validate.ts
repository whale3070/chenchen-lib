import type { CharacterArcMaster } from "@/types/character-arc";

const MAX_CUSTOM = 40;
const MAX_KEY = 64;
const MAX_BUILTIN = 8000;
const MAX_VALUE_CUSTOM = 4000;

function isIntOrUndefNull(x: unknown): boolean {
  if (x === undefined || x === null) return true;
  return typeof x === "number" && Number.isFinite(x) && x >= 1 && x === Math.floor(x);
}

function isStrOrUndefNull(x: unknown, max: number): boolean {
  if (x === undefined || x === null) return true;
  return typeof x === "string" && x.length <= max;
}

function isOptionalBuiltinString(x: unknown): boolean {
  return isStrOrUndefNull(x, MAX_BUILTIN);
}

function isValidCustomRows(x: unknown): boolean {
  if (x === undefined) return true;
  if (!Array.isArray(x) || x.length > MAX_CUSTOM) return false;
  for (const it of x) {
    if (!it || typeof it !== "object") return false;
    const r = it as Record<string, unknown>;
    if (typeof r.key !== "string" || r.key.length > MAX_KEY) return false;
    if (typeof r.value !== "string" || r.value.length > MAX_VALUE_CUSTOM) return false;
  }
  return true;
}

export function isCharacterArcMaster(x: unknown): x is CharacterArcMaster {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.schemaVersion !== 1) return false;
  if (typeof o.novelId !== "string" || !o.novelId.trim() || o.novelId.length > 200) return false;
  if (typeof o.stableId !== "string" || !o.stableId.trim() || o.stableId.length > 512) return false;
  if (typeof o.name !== "string" || !o.name.trim() || o.name.length > 64) return false;
  if (typeof o.namePinyin !== "string" || !/^[a-z0-9]{1,48}$/.test(o.namePinyin)) return false;
  if (!isStrOrUndefNull(o.firstSeenChapterId, 200)) return false;
  if (!isIntOrUndefNull(o.firstSeenChapterIndex)) return false;
  if (!isStrOrUndefNull(o.deathChapterId, 200)) return false;
  if (!isIntOrUndefNull(o.deathChapterIndex)) return false;
  if (typeof o.outcome !== "string" || o.outcome.length > 20_000) return false;
  if (typeof o.notes !== "string" || o.notes.length > 10_000) return false;
  if (typeof o.updatedAt !== "string" || o.updatedAt.length < 10) return false;

  if (!isOptionalBuiltinString(o.gender)) return false;
  if (!isOptionalBuiltinString(o.ageConst)) return false;
  if (!isOptionalBuiltinString(o.birthBackground)) return false;
  if (!isOptionalBuiltinString(o.appearanceConst)) return false;
  if (!isOptionalBuiltinString(o.personalityVar)) return false;
  if (!isOptionalBuiltinString(o.skills)) return false;
  if (!isOptionalBuiltinString(o.luck)) return false;
  if (!isOptionalBuiltinString(o.combatPower)) return false;
  if (!isOptionalBuiltinString(o.locationVar)) return false;
  if (!isValidCustomRows(o.customConstants)) return false;
  if (!isValidCustomRows(o.customVariables)) return false;

  return true;
}
