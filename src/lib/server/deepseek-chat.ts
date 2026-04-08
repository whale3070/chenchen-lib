import fs from "node:fs/promises";
import path from "node:path";

function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const k = trimmed.slice(0, idx).trim();
  let v = trimmed.slice(idx + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return [k, v];
}

export async function readFallbackEnv(): Promise<Record<string, string>> {
  const fp = path.join(process.cwd(), "..", "..", ".env.production");
  try {
    const raw = await fs.readFile(fp, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const kv = parseDotEnvLine(line);
      if (!kv) continue;
      out[kv[0]] = kv[1];
    }
    return out;
  } catch {
    return {};
  }
}

export type DeepSeekMsg = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function callDeepSeekChat(messages: DeepSeekMsg[]): Promise<string> {
  const envFallback = await readFallbackEnv();
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    envFallback.DEEPSEEK_API_KEY ||
    envFallback.OPENAI_API_KEY;
  const baseUrl =
    process.env.DEEPSEEK_BASE_URL ||
    envFallback.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com";
  const model =
    process.env.DEEPSEEK_MODEL || envFallback.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) {
    throw new Error("AI 服务未配置（缺少 DEEPSEEK_API_KEY）");
  }
  const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`AI 请求失败 (${resp.status}) ${t.slice(0, 200)}`);
  }
  const respText = await resp.text();
  const trimmed = respText.trim();
  if (!trimmed) {
    throw new Error("AI 返回空响应（无正文）");
  }
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(trimmed) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch {
    throw new Error(`AI 返回非 JSON：${trimmed.slice(0, 160)}`);
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("AI 返回为空");
  return text;
}
