/**
 * Shared Claude / OpenAI-compatible chat endpoint config for:
 * - workspace AI chat (`/api/v1/workspace/claude-chat`)
 * - multilingual translation when author picks a Claude model
 */

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-6";

export type ClaudeModelChoice = { id: string; model: string };

export function getClaudeCompletionsUrl(): string | null {
  const raw = process.env.CLAUDE_URL?.trim();
  if (!raw) return null;
  const noComment = raw.split("#")[0].trim();
  if (noComment.includes("chat/completions")) return noComment;
  return `${noComment.replace(/\/$/, "")}/chat/completions`;
}

export function getClaudeApiKey(): string | null {
  return process.env.CLAUDE_API?.trim() || null;
}

/**
 * 优先使用 CLAUDE_MODEL_ID1, CLAUDE_MODEL_ID2, …（最多 CLAUDE_MODEL_ID32；中间可留空跳过）。
 * 未配置任何 ID* 时，回退为 CLAUDE_MODEL（及可选 CLAUDE_MODEL_ID2 作为第二路），与旧环境兼容。
 */
export function getClaudeModelChoices(): ClaudeModelChoice[] {
  const hasId1 = Boolean(process.env.CLAUDE_MODEL_ID1?.trim());
  if (hasId1) {
    const fromIds: ClaudeModelChoice[] = [];
    for (let i = 1; i <= 32; i++) {
      const v = process.env[`CLAUDE_MODEL_ID${i}`]?.trim();
      if (v) fromIds.push({ id: String(i), model: v });
    }
    return fromIds;
  }
  const primary = process.env.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
  const legacySecond = process.env.CLAUDE_MODEL_ID2?.trim();
  const out: ClaudeModelChoice[] = [{ id: "1", model: primary }];
  if (legacySecond) out.push({ id: "2", model: legacySecond });
  return out;
}

export function isClaudeChatConfigured(): boolean {
  return Boolean(getClaudeCompletionsUrl() && getClaudeApiKey());
}
