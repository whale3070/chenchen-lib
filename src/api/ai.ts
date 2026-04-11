import type { Persona } from "@chenchen/shared/types";
import { isAddress } from "viem";

import type { EditorDeduceContext } from "@/lib/editor-context";

const DEDUCE_PATH = "/api/v1/ai/deduce";
const DEEP_STREAM_PATH = "/api/v1/ai/deep-stream";
const MIROFISH_PING_PATH = "/api/v1/ai/mirofish-ping";

/** 展示用：作者端 AI 经 Next 同源代理，不再直连 Python */
export function getAiBaseUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/v1/ai`;
  }
  return "/api/v1/ai";
}

/** 本地/无钱包时的占位；代理路由要求有效钱包地址（开发可设 AUTHOR_AI_SKIP_MEMBERSHIP_CHECK） */
const BILLING_USER_ID =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_BILLING_USER_ID
    ? process.env.NEXT_PUBLIC_BILLING_USER_ID
    : "local-dev";

let billingUserOverride: string | null = null;

/** 由客户端在连接钱包后设置，以便 AI 请求携带作者地址。 */
export function setBillingUserOverride(id: string | null) {
  billingUserOverride = id;
}

function authorAiHeaders(extra?: Record<string, string>): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const fromWallet = billingUserOverride && isAddress(billingUserOverride);
  const fallbackId = BILLING_USER_ID;
  const addr =
    fromWallet ? billingUserOverride! : isAddress(fallbackId) ? fallbackId : null;
  if (addr) {
    h["x-wallet-address"] = addr;
  }
  return h;
}

function personaPayload(personas: Persona[]) {
  return personas.map((p) => ({
    id: p.id,
    name: p.name,
    role_label: p.roleLabel,
    bio: p.bio,
    drama: {
      stance: {
        summary: p.drama.stance.summary,
        toward: p.drama.stance.toward,
        evidence_in_story: p.drama.stance.evidence_in_story,
        visibility: p.drama.stance.visibility,
      },
      motivation: p.drama.motivation,
      current_conflict: p.drama.current_conflict,
      metadata: p.drama.metadata,
    },
    links: p.links,
  }));
}

export type DeduceResponse = {
  mode?: string;
  message?: string;
  result?: {
    overview?: string;
    per_character?: Record<
      string,
      {
        likely_action?: string;
        line_direction?: string;
        risk?: string;
        insert_suggestion?: string;
      }
    >;
    updated_dramas?: Record<string, unknown>;
  };
};

export async function postDeduce(params: {
  manuscriptExcerpt: string;
  userPrompt: string | null;
  personas: Persona[];
  context: EditorDeduceContext | null;
}): Promise<DeduceResponse> {
  const ctx = params.context;
  const body = {
    manuscript_excerpt: params.manuscriptExcerpt,
    user_prompt: params.userPrompt,
    personas: personaPayload(params.personas),
    context: ctx
      ? {
          selection: ctx.selection,
          full_document: ctx.fullDocument,
          selection_from: ctx.selectionFrom,
          selection_to: ctx.selectionTo,
          book_premise: ctx.bookPremise ?? "",
        }
      : null,
  };
  const res = await fetch(DEDUCE_PATH, {
    method: "POST",
    headers: authorAiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export type DeepStreamEvent = Record<string, unknown> & {
  type?: string;
};

/** POST /v1/mirofish/deep-stream，按行解析 SSE data JSON */
export async function streamDeepSimulation(
  params: {
    graphId: string;
    simulationId: string | null;
    userPrompt: string;
    interviewAgentId: number;
    context: EditorDeduceContext | null;
    personas: Persona[];
    startSimulation: boolean;
    maxRounds?: number;
  },
  onEvent: (ev: DeepStreamEvent) => void,
): Promise<void> {
  const ctx = params.context;
  const body = {
    graph_id: params.graphId,
    simulation_id: params.simulationId,
    user_prompt: params.userPrompt,
    interview_agent_id: params.interviewAgentId,
    context: ctx
      ? {
          selection: ctx.selection,
          full_document: ctx.fullDocument,
          selection_from: ctx.selectionFrom,
          selection_to: ctx.selectionTo,
          book_premise: ctx.bookPremise ?? "",
        }
      : null,
    personas: personaPayload(params.personas),
    start_simulation: params.startSimulation,
    max_rounds: params.maxRounds ?? 20,
  };
  const res = await fetch(DEEP_STREAM_PATH, {
    method: "POST",
    headers: authorAiHeaders({ Accept: "text/event-stream" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("无响应流");
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const block of parts) {
      const line = block
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as DeepStreamEvent);
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}

export async function pingMirofish(): Promise<boolean> {
  try {
    const res = await fetch(MIROFISH_PING_PATH, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
