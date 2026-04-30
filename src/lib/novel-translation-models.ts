/**
 * Multilingual novel translation: union of Volcengine Ark (豆包) and Claude-compatible
 * models (CLAUDE_MODEL_ID1… / CLAUDE_MODEL). Stored preference uses `ark:modelId` or
 * `claude:modelId` to disambiguate.
 */
import {
  getClaudeModelChoices,
  isClaudeChatConfigured,
} from "@/lib/server/claude-chat-config";

export const DEFAULT_ARK_TRANSLATION_MODEL = "doubao-seed-1-8-251228";

const MODEL_ID_RE = /^[a-zA-Z0-9_.-]{1,160}$/;

function parseIdsFromEnv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => MODEL_ID_RE.test(s));
}

/** Ark endpoint ids exposed for translation (same rules as before). */
export function getNovelTranslationModelAllowlist(): string[] {
  const raw = process.env.NOVEL_TRANSLATION_MODEL_IDS?.trim();
  if (raw) {
    const ids = parseIdsFromEnv(raw);
    const uniq = Array.from(new Set(ids));
    if (uniq.length > 0) return uniq;
  }
  const m = (process.env.ARK_MODEL || process.env.DOUBAO_MODEL || "").trim();
  if (m && MODEL_ID_RE.test(m)) return [m];
  return [DEFAULT_ARK_TRANSLATION_MODEL];
}

export type TranslationEngineBackend = "ark" | "claude";

export type TranslationModelOption = {
  /** Stored in preferences, e.g. `ark:doubao-seed-1-8-251228` or `claude:claude-opus-4-6` */
  value: string;
  provider: TranslationEngineBackend;
  model: string;
};

export function getTranslationModelOptions(): TranslationModelOption[] {
  const out: TranslationModelOption[] = [];
  for (const m of getNovelTranslationModelAllowlist()) {
    out.push({ value: `ark:${m}`, provider: "ark", model: m });
  }
  if (isClaudeChatConfigured()) {
    for (const c of getClaudeModelChoices()) {
      out.push({ value: `claude:${c.model}`, provider: "claude", model: c.model });
    }
  }
  return out;
}

function optionMatches(
  provider: TranslationEngineBackend,
  model: string,
): boolean {
  return getTranslationModelOptions().some(
    (o) => o.provider === provider && o.model === model,
  );
}

export function resolveTranslationBackend(
  saved: string | null | undefined,
): { provider: TranslationEngineBackend; model: string } {
  const s = (saved ?? "").trim();
  const opts = getTranslationModelOptions();

  if (s.startsWith("claude:")) {
    const m = s.slice("claude:".length).trim();
    if (m && optionMatches("claude", m)) return { provider: "claude", model: m };
  }
  if (s.startsWith("ark:")) {
    const m = s.slice("ark:".length).trim();
    if (m && optionMatches("ark", m)) return { provider: "ark", model: m };
  }
  // Legacy: plain model id (before ark:/claude: prefixes)
  if (s && optionMatches("claude", s)) return { provider: "claude", model: s };
  if (s && optionMatches("ark", s)) return { provider: "ark", model: s };

  const first = opts[0];
  if (first) return { provider: first.provider, model: first.model };
  return { provider: "ark", model: DEFAULT_ARK_TRANSLATION_MODEL };
}

export function canonicalTranslationPreferenceValue(backend: {
  provider: TranslationEngineBackend;
  model: string;
}): string {
  return `${backend.provider}:${backend.model}`;
}

export function isValidTranslationPreferenceValue(raw: string): boolean {
  const t = raw.trim();
  return getTranslationModelOptions().some((o) => o.value === t);
}

export function normalizeTranslationPreferenceInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (t.length > 240) return "";
  if (!/^(ark|claude):/.test(t)) return "";
  return t;
}
