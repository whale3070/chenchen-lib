import {
  DEFAULT_CLAUDE_MODEL,
  getClaudeApiKey,
  getClaudeCompletionsUrl,
  getClaudeModelChoices,
  isClaudeChatConfigured,
} from "@/lib/server/claude-chat-config";
import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function parseWalletHeader(
  req: NextRequest,
): { ok: true; walletLower: string } | { ok: false; res: NextResponse } {
  const headerAddr = req.headers.get("x-wallet-address")?.trim() ?? "";
  if (!isAddress(headerAddr)) {
    return { ok: false, res: unauthorized("缺少或无效的 x-wallet-address") };
  }
  return { ok: true, walletLower: headerAddr.toLowerCase() };
}

/** 默认 system：避免模型“假装能打开链接”；可由 CLAUDE_SYSTEM 完全覆盖。 */
const DEFAULT_CLAUDE_SYSTEM = [
  "You are a helpful assistant in the author workspace of Chenchen-Lib.",
  "You cannot open URLs, browse the web, or fetch live page content. You only see the text the user pastes in chat.",
  "If the user only gives links (e.g. to pitch-deck.html or the home page), say clearly that you cannot visit them, and ask them to paste the relevant paragraphs or a summary. Do not claim you are loading or visiting a URL.",
  "Reply in the same language as the user when possible. Be substantive and complete unless the user asks for brevity.",
].join("\n");

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

/**
 * 返回是否已配置、默认模型、可选模型列表（无密钥；用于前端下拉里切换）
 */
export async function GET() {
  const choices = getClaudeModelChoices();
  return NextResponse.json({
    configured: isClaudeChatConfigured(),
    model: choices[0]?.model ?? DEFAULT_CLAUDE_MODEL,
    choices,
  });
}

/**
 * OpenAI 兼容的 chat/completions 转发（适合 HopeAI、OneAPI 等；密钥仅服务端使用）
 */
export async function POST(req: NextRequest) {
  const wh = parseWalletHeader(req);
  if (!wh.ok) return wh.res;

  const url = getClaudeCompletionsUrl();
  const apiKey = getClaudeApiKey();
  if (!url || !apiKey) {
    return NextResponse.json(
      {
        error: "未配置 CLAUDE_URL 或 CLAUDE_API",
        code: "CLAUDE_NOT_CONFIGURED",
        model: getClaudeModelChoices()[0]?.model ?? DEFAULT_CLAUDE_MODEL,
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("JSON 正文中须包含 messages 数组");
  }
  if (!body || typeof body !== "object") return badRequest("请求体无效");

  const rawMessages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return badRequest("至少一条对话消息");
  }

  const messages: ChatMessage[] = [];
  for (const m of rawMessages) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    messages.push({ role, content: content.slice(0, 200_000) });
  }
  if (messages.length === 0) {
    return badRequest("无有效消息内容");
  }

  const choices = getClaudeModelChoices();
  const rawSlot = (body as { modelSlot?: unknown }).modelSlot;
  let slotId =
    typeof rawSlot === "string" && rawSlot.trim().length > 0 ? rawSlot.trim() : "1";
  if (typeof rawSlot === "number" && Number.isInteger(rawSlot) && rawSlot >= 1) {
    slotId = String(rawSlot);
  }
  const chosen = choices.find((c) => c.id === slotId);
  const resolvedModel = chosen?.model ?? choices[0]?.model ?? DEFAULT_CLAUDE_MODEL;

  const envSystem = process.env.CLAUDE_SYSTEM?.trim();
  if (messages[0]?.role !== "system") {
    messages.unshift({
      role: "system",
      content: (envSystem && envSystem.length > 0
        ? envSystem
        : DEFAULT_CLAUDE_SYSTEM
      ).slice(0, 100_000),
    });
  }

  const model = resolvedModel;
  const defaultMax = (() => {
    const e = process.env.CLAUDE_MAX_TOKENS?.trim();
    if (e) {
      const n = Number(e);
      if (n >= 1 && n <= 8192) return n;
    }
    return 4096;
  })();
  const maxTokens = (() => {
    const m = (body as { max_tokens?: unknown }).max_tokens;
    if (typeof m === "number" && m >= 1 && m <= 8192) return Math.floor(m);
    if (typeof m === "string") {
      const n = Number(m);
      if (n >= 1 && n <= 8192) return n;
    }
    return defaultMax;
  })();

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
    }),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `上游 API 错误：HTTP ${upstream.status}`, detail: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch {
    return NextResponse.json({ error: "上游返回非 JSON" }, { status: 502 });
  }

  const p = parsed as { choices?: Array<{ message?: { content?: string } }> };
  const content = p.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return NextResponse.json(
      { error: "响应中无 assistant 正文", raw: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  return NextResponse.json({ content, model });
}
