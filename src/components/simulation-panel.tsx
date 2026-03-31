"use client";

import type { Editor } from "@tiptap/core";
import { Loader2, Radio, Sparkles, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAiBaseUrl,
  pingMirofish,
  postDeduce,
  streamDeepSimulation,
  type DeduceResponse,
} from "@/api/ai";
import type { EditorDeduceContext } from "@/lib/editor-context";
import {
  applyUpdatedDramas,
  safeUpdatedDramas,
} from "@/lib/merge-drama";
import type { Persona } from "@chenchen/shared/types";

type SimMode = "light" | "deep";

type Props = {
  open: boolean;
  onClose: () => void;
  manuscript: string;
  personas: Persona[];
  context: EditorDeduceContext | null;
  onPersonasUpdate: (next: Persona[]) => void;
  editor: Editor | null;
};

/** 不调用 focus()，避免推演面板失焦导致选区快照错乱 */
function insertBlockquote(editor: Editor, pos: number, text: string) {
  const safe = text.replace(/\s+/g, " ").trim();
  if (!safe) return;
  editor
    .chain()
    .insertContentAt(pos, {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: safe }] },
      ],
    })
    .run();
}

export function SimulationPanel({
  open,
  onClose,
  manuscript,
  personas,
  context,
  onPersonasUpdate,
  editor,
}: Props) {
  const AI_BASE = useMemo(() => getAiBaseUrl(), []);
  const [mode, setMode] = useState<SimMode>("light");
  const [prompt, setPrompt] = useState(
    "若尚淳拿出黄皮封套作为筹码，林砚下一轮会退让还是反将一军？",
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeduceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mirofishOk, setMirofishOk] = useState<boolean | null>(null);

  const [graphId, setGraphId] = useState("");
  const [simulationId, setSimulationId] = useState("");
  const [agentId, setAgentId] = useState(0);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [streamInterview, setStreamInterview] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    pingMirofish().then((ok) => {
      if (!cancelled) setMirofishOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const personasForRequest = context?.personasSnapshot ?? personas;
  const excerpt = useMemo(() => {
    if (context?.selection?.trim()) return context.selection.trim();
    return manuscript;
  }, [context, manuscript]);

  /** 仅使用打开面板时快照的 anchor，禁止回退到实时 selection（面板操作会使编辑器失焦） */
  const insertPos =
    context != null ? context.selectionFrom : null;

  const applyDramaFromResult = useCallback(
    (r: DeduceResponse) => {
      const ud = safeUpdatedDramas(r.result?.updated_dramas);
      if (ud) {
        onPersonasUpdate(applyUpdatedDramas(personas, ud));
      }
    },
    [onPersonasUpdate, personas],
  );

  const runDeduce = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await postDeduce({
        manuscriptExcerpt: excerpt,
        userPrompt: prompt || null,
        personas: personasForRequest,
        context,
      });
      setResult(data);
      applyDramaFromResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    applyDramaFromResult,
    context,
    excerpt,
    personasForRequest,
    prompt,
  ]);

  const runDeepStream = useCallback(async () => {
    if (!graphId.trim()) {
      setError("深度模拟需要填写 Zep graph_id（MiroFish 图谱）。");
      return;
    }
    setLoading(true);
    setError(null);
    setStreamLog([]);
    setStreamInterview("");
    try {
      let interviewFull = "";
      await streamDeepSimulation(
        {
          graphId: graphId.trim(),
          simulationId: simulationId.trim() || null,
          userPrompt: prompt,
          interviewAgentId: agentId,
          context,
          personas: personasForRequest,
          startSimulation: Boolean(simulationId.trim()),
          maxRounds: 20,
        },
        (ev) => {
          const t = ev.type ?? "event";
          if (t === "interview_chunk" && typeof ev.text === "string") {
            interviewFull += ev.text;
            setStreamInterview((s) => s + ev.text);
          } else if (t === "interview_done" && typeof ev.full_text === "string") {
            interviewFull = ev.full_text;
            setStreamInterview(ev.full_text);
          } else {
            setStreamLog((l) => [...l, JSON.stringify(ev)]);
          }
          if (t === "error") {
            setError(
              typeof ev.message === "string"
                ? ev.message
                : JSON.stringify(ev),
            );
          }
        },
      );

      if (interviewFull.trim()) {
        const synth = await postDeduce({
          manuscriptExcerpt: interviewFull.slice(0, 12000),
          userPrompt:
            (prompt || "推演结果") +
            "\n\n请将 Agent 自由文本中的立场与冲突变化，提炼为 updated_dramas（与输入角色 id 对应）。",
          personas: personasForRequest,
          context,
        });
        setResult(synth);
        applyDramaFromResult(synth);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    agentId,
    applyDramaFromResult,
    context,
    graphId,
    personasForRequest,
    prompt,
    simulationId,
  ]);

  const refreshCardsFromInterview = useCallback(async () => {
    if (!streamInterview.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const synth = await postDeduce({
        manuscriptExcerpt: streamInterview.slice(0, 12000),
        userPrompt:
          prompt ||
          "根据下列 Agent 推演文本，更新各角色 stance / current_conflict（输出 updated_dramas）。",
        personas: personasForRequest,
        context,
      });
      setResult(synth);
      applyDramaFromResult(synth);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    applyDramaFromResult,
    context,
    personasForRequest,
    prompt,
    streamInterview,
  ]);

  if (!open) return null;

  const branches = result?.result?.per_character;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sim-panel-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" aria-hidden />
            <h2
              id="sim-panel-title"
              className="text-sm font-semibold text-neutral-900 dark:text-neutral-50"
            >
              AI 角色推演
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 text-sm text-neutral-800 dark:text-neutral-200">
          <div className="mb-3 flex gap-2 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800/80">
            <button
              type="button"
              onClick={() => setMode("light")}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                mode === "light"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-900 dark:text-neutral-50"
                  : "text-neutral-600 dark:text-neutral-400"
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              快速推演
            </button>
            <button
              type="button"
              onClick={() => setMode("deep")}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                mode === "deep"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-900 dark:text-neutral-50"
                  : "text-neutral-600 dark:text-neutral-400"
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              深度模拟
            </button>
          </div>

          <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
            服务 <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-950">{AI_BASE}</code>
            {" · "}
            MiroFish：{" "}
            {mirofishOk === null
              ? "检测中…"
              : mirofishOk
                ? "可达"
                : "不可达（仅快速推演可用）"}
          </p>

          {mode === "deep" && (
            <div className="mb-3 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
              <label className="block text-xs font-medium text-neutral-500">
                graph_id（必填）
              </label>
              <input
                className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={graphId}
                onChange={(e) => setGraphId(e.target.value)}
                placeholder="mirofish_xxx / Zep 图谱 ID"
              />
              <label className="block text-xs font-medium text-neutral-500">
                simulation_id（已 prepared 时填写：将 start + interview）
              </label>
              <input
                className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={simulationId}
                onChange={(e) => setSimulationId(e.target.value)}
                placeholder="sim_xxx（可选）"
              />
              <label className="block text-xs font-medium text-neutral-500">
                interview agent_id
              </label>
              <input
                type="number"
                className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={agentId}
                onChange={(e) => setAgentId(Number(e.target.value))}
              />
              <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                深度流式：generate-profiles →（若填写 simulation_id）start parallel → 轮询 env →
                interview，并以 SSE 推送片段。结束后会自动请求一次快速推演以尽量填充结构化卡片。
              </p>
            </div>
          )}

          <label className="block text-xs font-medium text-neutral-500">
            推演问题
          </label>
          <textarea
            className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          {context && (
            <div className="mt-2 rounded-md bg-neutral-100 p-2 text-xs text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
              <p className="font-medium text-neutral-700 dark:text-neutral-300">
                选区上下文（⌘⇧A）
              </p>
              <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap">
                {context.selection.trim()
                  ? context.selection
                  : "（空选区，将使用全文节选）"}
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950/50 dark:text-red-200">
              {error}
            </p>
          )}

          {streamLog.length > 0 && (
            <div className="mt-3 max-h-24 overflow-y-auto rounded-lg bg-neutral-100 p-2 font-mono text-[10px] text-neutral-700 dark:bg-neutral-950 dark:text-neutral-400">
              {streamLog.slice(-12).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}

          {streamInterview && (
            <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Agent 流式回复
              </p>
              <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">
                {streamInterview}
              </pre>
              <button
                type="button"
                onClick={refreshCardsFromInterview}
                disabled={loading}
                className="mt-2 text-xs font-medium text-amber-800 underline dark:text-amber-300"
              >
                仅根据上文刷新右侧角色卡片
              </button>
            </div>
          )}

          {branches && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-neutral-500">
                推演分支
              </p>
              {Object.entries(branches).map(([id, b]) => {
                const p = personasForRequest.find((x) => x.id === id);
                const label = p?.name ?? id;
                const suggestion = b.insert_suggestion?.trim();
                return (
                  <div
                    key={id}
                    className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                  >
                    <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                      {label}
                    </p>
                    {b.likely_action && (
                      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                        {b.likely_action}
                      </p>
                    )}
                    {b.line_direction && (
                      <p className="mt-1 text-xs italic text-neutral-500">
                        台词走向：{b.line_direction}
                      </p>
                    )}
                    {suggestion && editor && insertPos != null && (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-md bg-neutral-900 py-2 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                        onClick={() => {
                          insertBlockquote(editor, insertPos, suggestion);
                        }}
                      >
                        采纳并插入（blockquote）
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {result?.result?.overview && (
            <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
              {result.result.overview}
            </p>
          )}

          {result != null && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-neutral-500">
                原始 JSON
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-neutral-100 p-2 text-[10px] dark:bg-neutral-950">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            关闭
          </button>
          {mode === "light" ? (
            <button
              type="button"
              onClick={runDeduce}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              推演
            </button>
          ) : (
            <button
              type="button"
              onClick={runDeepStream}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              开始深度流式
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
