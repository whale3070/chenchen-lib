import fs from "node:fs/promises";
import path from "node:path";

import { parseLeadingJsonValue } from "@/lib/parse-leading-json";

export type TranslationPreferencesData = {
  authorId: string;
  preferredLanguages: string[];
  defaultTargetLanguage: string;
  /** Volcengine Ark endpoint model id chosen by author */
  translationModel?: string;
  updatedAt: string;
};

function preferencesPath(authorLower: string) {
  return path.join(
    process.cwd(),
    ".data",
    "translation-preferences",
    `${authorLower}.json`,
  );
}

export function normalizeLangList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(out)).slice(0, 8);
}

export async function readTranslationPreferencesData(
  authorLower: string,
): Promise<TranslationPreferencesData | null> {
  const fp = preferencesPath(authorLower);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const data = parseLeadingJsonValue(raw) as Partial<TranslationPreferencesData>;
    const preferredLanguages = normalizeLangList(data.preferredLanguages);
    const defaultTargetLanguage =
      typeof data.defaultTargetLanguage === "string"
        ? data.defaultTargetLanguage.trim().toLowerCase()
        : "";
    const translationModel =
      typeof data.translationModel === "string" ? data.translationModel.trim() : "";
    return {
      authorId: authorLower,
      preferredLanguages,
      defaultTargetLanguage:
        defaultTargetLanguage || preferredLanguages[0] || "en",
      translationModel: translationModel || undefined,
      updatedAt:
        typeof data.updatedAt === "string"
          ? data.updatedAt
          : new Date().toISOString(),
    };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function writeTranslationPreferencesData(data: TranslationPreferencesData) {
  const fp = preferencesPath(data.authorId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(data, null, 2), "utf8");
}
