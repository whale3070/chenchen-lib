import type { Persona } from "@chenchen/shared/types";

import type { EditorDeduceContext } from "@/lib/editor-context";

const AI_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_AI_SERVICE_URL
    ? process.env.NEXT_PUBLIC_AI_SERVICE_URL
    : "http://127.0.0.1:8787";

export function getAiBaseUrl() {
  return AI_BASE;
}

/** 与 services/ai 计费头一致；生产请配置 NEXT_PUBLIC_BILLING_USER_ID */
const BILLING_USER_ID =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_BILLING_USER_ID
    ? process.env.NEXT_PUBLIC_BILLING_USER_ID
    : "local-dev";

let billingUserOverride: string | null = null;

/** 由客户端在连接钱包后设置，以便 AI 请求携带作者地址。 */
export function setBillingUserOverride(id: string | null) {
  billingUserOverride = id;
}

function billingHeaders(): HeadersInit {
  const id = billingUserOverride ?? BILLING_USER_ID;
  return { "X-User-Id": id };
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
  const res = await fetch(`${AI_BASE}/v1/deduce`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...billingHeaders(),
    },
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
  const res = await fetch(`${AI_BASE}/v1/mirofish/deep-stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...billingHeaders(),
    },
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
    const res = await fetch(`${AI_BASE}/v1/mirofish/ping`);
    return res.ok;
  } catch {
    return false;
  }
}
