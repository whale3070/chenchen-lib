"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReaderChapterMarkdown } from "@/components/reader-chapter-markdown";
import { useSiteLocale } from "@/providers/site-locale-provider";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "chenchen:workspace:claude-chat:v1";
const MODEL_SLOT_PREFIX = "chenchen:workspace:claude-modelslot:v1";

function modelSlotStorageKey(authorId: string) {
  return `${MODEL_SLOT_PREFIX}:${authorId.toLowerCase()}`;
}

function getDocumentFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function isNodeInDocumentFullscreen(node: Element | null): boolean {
  return Boolean(node && getDocumentFullscreenElement() === node);
}

function requestNodeFullscreen(node: HTMLElement): void {
  const w = node as HTMLElement & { webkitRequestFullscreen?: () => void; msRequestFullscreen?: () => void };
  if (typeof node.requestFullscreen === "function") {
    const p = node.requestFullscreen() as void | Promise<void> | undefined;
    if (p && typeof (p as Promise<void>).then === "function")
      void (p as Promise<void>).catch(() => {
        /* user denied or not allowed */
      });
    return;
  }
  w.webkitRequestFullscreen?.();
  w.msRequestFullscreen?.();
}

function exitDocumentFullscreen(): void {
  const d = document as Document & { webkitExitFullscreen?: () => void; msExitFullscreen?: () => void };
  if (document.exitFullscreen) {
    void document.exitFullscreen().catch(() => {
      /* already exited */
    });
  } else {
    d.webkitExitFullscreen?.();
    d.msExitFullscreen?.();
  }
}

type ModelChoice = { id: string; model: string };

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatTurn[];
};

type ChatStore = {
  sessions: ChatSession[];
  activeSessionId: string;
};

function storageKey(authorId: string) {
  return `${STORAGE_PREFIX}:${authorId.toLowerCase()}`;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function newEmptySession(titleFallback: string): ChatSession {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: titleFallback,
    updatedAt: now,
    messages: [],
  };
}

function isChatTurn(x: unknown): x is ChatTurn {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    (o.role === "user" || o.role === "assistant") &&
    typeof o.content === "string" &&
    typeof o.createdAt === "string"
  );
}

function isChatSession(x: unknown): x is ChatSession {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string" || typeof o.updatedAt !== "string")
    return false;
  if (!Array.isArray(o.messages)) return false;
  return o.messages.every(isChatTurn);
}

function parseStore(raw: string | null): ChatStore | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as Record<string, unknown>;
    if (!Array.isArray(o.sessions) || typeof o.activeSessionId !== "string") return null;
    const sessions = o.sessions.filter(isChatSession);
    if (sessions.length === 0) return null;
    const active =
      sessions.some((s) => s.id === o.activeSessionId) ? o.activeSessionId : sessions[0].id;
    return { sessions, activeSessionId: active };
  } catch {
    return null;
  }
}

/** Why `parseStore` returned null (codes for UI / support; no message bodies). */
function parseStoreFailureReason(raw: string | null): string {
  if (!raw) return "no_raw";
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return "not_object";
    const o = j as Record<string, unknown>;
    if (!Array.isArray(o.sessions)) return "sessions_not_array";
    if (typeof o.activeSessionId !== "string") return "no_activeSessionId";
    const n = o.sessions.length;
    const valid = (o.sessions as unknown[]).filter(isChatSession).length;
    if (valid === 0) return n === 0 ? "empty_sessions" : "all_sessions_failed_validation";
    return "ok";
  } catch {
    return "json_throw";
  }
}

function defaultStore(titleFallback: string): ChatStore {
  const s = newEmptySession(titleFallback);
  return { sessions: [s], activeSessionId: s.id };
}

function titleFromFirstUserMessage(text: string, fallback: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return fallback;
  if (t.length <= 40) return t;
  return `${t.slice(0, 37)}…`;
}

export function WorkspaceClaudeChat({ authorId }: { authorId: string }) {
  const { t } = useSiteLocale();
  const defaultThreadTitle = useMemo(() => t("workspace.aiChatNewThread"), [t]);
  const [store, setStore] = useState<ChatStore | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState<string>("");
  const [modelChoices, setModelChoices] = useState<ModelChoice[] | null>(null);
  const [modelSlot, setModelSlot] = useState<string>("1");
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const copiedResetTimerRef = useRef<number | null>(null);
  /** When localStorage has bytes but parseStore fails, do not persist in-memory default over raw. */
  const skipPersistCorruptRef = useRef(false);

  const key = useMemo(() => storageKey(authorId), [authorId]);
  const [storageParseFailed, setStorageParseFailed] = useState<{
    reason: string;
  } | null>(null);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
    const parsed = parseStore(raw);
    const failReason = parseStoreFailureReason(raw);
    const corrupt = Boolean(raw && !parsed);
    skipPersistCorruptRef.current = corrupt;
    setStorageParseFailed(corrupt ? { reason: failReason } : null);
    setStore(parsed ?? defaultStore(defaultThreadTitle));
    setHydrated(true);
  }, [key, defaultThreadTitle, authorId]);

  const discardCorruptStorageAndEnablePersist = useCallback(() => {
    skipPersistCorruptRef.current = false;
    setStorageParseFailed(null);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setStore(defaultStore(defaultThreadTitle));
  }, [defaultThreadTitle, key]);

  useEffect(() => {
    if (!hydrated || !store) return;
    if (skipPersistCorruptRef.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* quota or private mode */
    }
  }, [hydrated, key, store]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/workspace/claude-chat", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        model?: string;
        choices?: ModelChoice[];
      };
      setConfigured(data.configured === true);
      const primary = typeof data.model === "string" ? data.model : "";
      const rawChoices = Array.isArray(data.choices) ? data.choices : [];
      const choices: ModelChoice[] = rawChoices
        .filter(
          (c): c is ModelChoice =>
            c &&
            typeof c === "object" &&
            typeof c.id === "string" &&
            c.id.length > 0 &&
            typeof c.model === "string" &&
            c.model.trim().length > 0,
        )
        .map((c) => ({ id: c.id, model: c.model.trim() }));
      const finalChoices =
        choices.length > 0
          ? choices
          : primary
            ? [{ id: "1" as const, model: primary }]
            : [];
      setModelChoices(finalChoices.length > 0 ? finalChoices : null);

      let slot = String(finalChoices[0]?.id ?? "1");
      try {
        const saved = window.localStorage.getItem(modelSlotStorageKey(authorId))?.trim();
        if (saved && finalChoices.some((c) => c.id === saved)) slot = saved;
      } catch {
        /* ignore */
      }
      setModelSlot(slot);
      const currentName = finalChoices.find((c) => c.id === slot)?.model ?? primary;
      setModelLabel(currentName);
    } catch {
      setConfigured(false);
    }
  }, [authorId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const sync = () => {
      setChatFullscreen(isNodeInDocumentFullscreen(rootRef.current));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  const setModelSlotAndPersist = useCallback(
    (next: string) => {
      if (!modelChoices?.some((c) => c.id === next)) return;
      setModelSlot(next);
      setModelLabel(modelChoices.find((c) => c.id === next)?.model ?? "");
      try {
        window.localStorage.setItem(modelSlotStorageKey(authorId), next);
      } catch {
        /* ignore */
      }
    },
    [authorId, modelChoices],
  );

  const activeSession = useMemo(() => {
    if (!store) return null;
    return store.sessions.find((s) => s.id === store.activeSessionId) ?? null;
  }, [store]);

  const sortedSessions = useMemo(() => {
    if (!store) return [];
    return [...store.sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [store]);

  const selectSession = useCallback((id: string) => {
    setStore((prev) => {
      if (!prev || !prev.sessions.some((s) => s.id === id)) return prev;
      return { ...prev, activeSessionId: id };
    });
    setError(null);
  }, []);

  const newThread = useCallback(() => {
    const session = newEmptySession(defaultThreadTitle);
    setStore((prev) => {
      const base = prev ?? defaultStore(defaultThreadTitle);
      return {
        sessions: [session, ...base.sessions],
        activeSessionId: session.id,
      };
    });
    setError(null);
    setInput("");
  }, [defaultThreadTitle]);

  const deleteActiveThread = useCallback(() => {
    if (!store || !activeSession) return;
    if (!window.confirm(t("workspace.aiChatConfirmDeleteThread"))) return;
    const rest = store.sessions.filter((s) => s.id !== activeSession.id);
    setStore(() => {
      if (rest.length === 0) return defaultStore(defaultThreadTitle);
      const nextActive = rest[0].id;
      return { sessions: rest, activeSessionId: nextActive };
    });
    setError(null);
  }, [activeSession, defaultThreadTitle, store, t]);

  const clearAllThreads = useCallback(() => {
    if (!window.confirm(t("workspace.aiChatConfirmClearAll"))) return;
    setStore(defaultStore(defaultThreadTitle));
    setError(null);
    setInput("");
  }, [defaultThreadTitle, t]);

  const exportChatBackup = useCallback(() => {
    const safe = authorId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "author";
    if (storageParseFailed) {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        raw = null;
      }
      if (raw && raw.length > 0) {
        const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `claude-chat-RAW-localStorage-${safe}.json`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 3_000);
        return;
      }
    }
    if (!store) return;
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claude-chat-backup-${safe}.json`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3_000);
  }, [authorId, key, storageParseFailed, store]);

  const onImportBackupSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const text = (await file.text()).trim();
        const parsed = parseStore(text);
        if (!parsed) {
          window.alert(t("workspace.aiChatImportError"));
          return;
        }
        skipPersistCorruptRef.current = false;
        setStorageParseFailed(null);
        setStore(parsed);
        setError(null);
      } catch {
        window.alert(t("workspace.aiChatImportError"));
      }
    },
    [t],
  );

  const send = useCallback(async () => {
    if (!store || !activeSession || sending) return;
    const text = input.trim();
    if (!text) return;
    if (configured === false) {
      setError(t("workspace.aiChatUnconfigured"));
      return;
    }

    const messagesBeforeSend = activeSession.messages;

    const userTurn: ChatTurn = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...activeSession.messages, userTurn];
    const nextTitle =
      activeSession.messages.length === 0
        ? titleFromFirstUserMessage(text, defaultThreadTitle)
        : activeSession.title;

    setStore((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      return {
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === activeSession.id
            ? { ...s, title: nextTitle, updatedAt: now, messages: nextMessages }
            : s,
        ),
      };
    });
    setInput("");
    setSending(true);
    setError(null);

    const apiMessages = nextMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      const res = await fetch("/api/v1/workspace/claude-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": authorId,
        },
        body: JSON.stringify({
          messages: apiMessages,
          modelSlot,
          max_tokens: 4096,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        content?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const content = typeof data.content === "string" ? data.content : "";
      if (!content.trim()) {
        throw new Error(t("workspace.aiChatError"));
      }
      const assistantTurn: ChatTurn = {
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      };
      setStore((prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          sessions: prev.sessions.map((s) => {
            if (s.id !== activeSession.id) return s;
            return {
              ...s,
              updatedAt: now,
              messages: [...s.messages, assistantTurn],
            };
          }),
        };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStore((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === activeSession.id ? { ...s, messages: messagesBeforeSend } : s,
          ),
        };
      });
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [
    activeSession,
    authorId,
    configured,
    defaultThreadTitle,
    input,
    modelSlot,
    sending,
    store,
    t,
  ]);

  const toggleBrowserFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (isNodeInDocumentFullscreen(el)) exitDocumentFullscreen();
    else requestNodeFullscreen(el);
  }, []);

  const copyAssistantMessage = useCallback(
    async (content: string, messageKey: string) => {
      const text = content.trim();
      if (!text) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "true");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          ta.remove();
          if (!ok) throw new Error("copy-failed");
        }
        setCopiedMessageKey(messageKey);
        if (copiedResetTimerRef.current !== null) {
          window.clearTimeout(copiedResetTimerRef.current);
        }
        copiedResetTimerRef.current = window.setTimeout(() => {
          setCopiedMessageKey((prev) => (prev === messageKey ? null : prev));
        }, 1800);
      } catch {
        setError(t("workspace.aiChatCopyFailed"));
      }
    },
    [t],
  );

  if (!hydrated || !store || !activeSession) {
    return (
      <p className="rounded-xl border border-[#1e2a3f] bg-[#121a29] p-4 text-sm text-zinc-400">
        {t("workspace.sessionLoading")}
      </p>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex w-full min-w-0 flex-col gap-4",
        chatFullscreen &&
          "box-border h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-[#0b1320] px-3 py-2",
      )}
    >
      {storageParseFailed ? (
        <div
          className="w-full shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <p className="font-medium text-amber-50">{t("workspace.aiChatCorruptTitle")}</p>
          <p className="mt-2 text-amber-100/90">{t("workspace.aiChatCorruptBlurb")}</p>
          <p className="mt-1 font-mono text-[11px] text-amber-200/70">
            {t("workspace.aiChatCorruptReason")}: {storageParseFailed.reason}
          </p>
          <button
            type="button"
            onClick={discardCorruptStorageAndEnablePersist}
            className="mt-3 rounded-lg border border-amber-400/50 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-950/60"
          >
            {t("workspace.aiChatCorruptClearCta")}
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch",
        )}
      >
      <aside
        className={cn(
          "w-full shrink-0 space-y-2 lg:w-56",
          chatFullscreen && "flex min-h-0 max-w-full flex-col sm:max-w-[min(100%,16rem)]",
        )}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={newThread}
            className="rounded-lg border border-cyan-500/45 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            {t("workspace.aiChatNewThread")}
          </button>
          <button
            type="button"
            onClick={deleteActiveThread}
            disabled={store.sessions.length === 0}
            className="rounded-lg border border-red-500/35 px-3 py-1.5 text-xs text-red-200/90 hover:bg-red-500/10 disabled:opacity-40"
          >
            {t("workspace.aiChatDeleteThread")}
          </button>
          <button
            type="button"
            onClick={clearAllThreads}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-red-400/50 hover:text-red-200/90"
          >
            {t("workspace.aiChatClearAllThreads")}
          </button>
          <button
            type="button"
            onClick={exportChatBackup}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-cyan-400/50 hover:text-cyan-200/90"
          >
            {t("workspace.aiChatExportBackup")}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-cyan-400/50 hover:text-cyan-200/90"
          >
            {t("workspace.aiChatImportBackup")}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(ev) => void onImportBackupSelected(ev)}
          />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {t("workspace.aiChatThreads")}
        </p>
        <select
          value={activeSession.id}
          onChange={(e) => selectSession(e.target.value)}
          className="w-full rounded-lg border border-[#324866] bg-[#0d1625] px-2 py-2 text-xs text-zinc-200 lg:hidden"
        >
          {sortedSessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <ul
          className={cn(
            "hidden min-h-0 max-h-[min(60vh,520px)] space-y-1 overflow-y-auto rounded-lg border border-[#1e2a3f] bg-[#121a29] p-1 lg:block",
            chatFullscreen && "max-h-none min-h-0 flex-1",
          )}
        >
          {sortedSessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => selectSession(s.id)}
                className={
                  s.id === activeSession.id
                    ? "w-full rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-2 text-left text-xs text-cyan-100"
                    : "w-full rounded-md px-2 py-2 text-left text-xs text-zinc-400 hover:bg-[#1a2436]"
                }
              >
                <span className="line-clamp-2">{s.title}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-600">
                  {new Date(s.updatedAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col space-y-3", chatFullscreen && "min-h-0")}
      >
        <div className="shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-zinc-100">{t("workspace.aiChatTitle")}</h2>
              <p className="mt-1 max-w-2xl text-xs text-zinc-500">{t("workspace.aiChatBlurb")}</p>
            </div>
            <button
              type="button"
              onClick={toggleBrowserFullscreen}
              aria-pressed={chatFullscreen}
              className="shrink-0 rounded-lg border border-zinc-600/80 bg-[#121a29] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-200"
            >
              {chatFullscreen
                ? t("workspace.aiChatExitFullscreen")
                : t("workspace.aiChatEnterFullscreen")}
            </button>
          </div>
          {modelChoices && modelChoices.length > 1 ? (
            <div className="mt-3 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label
                htmlFor="workspace-claude-model"
                className="shrink-0 text-[11px] font-medium text-zinc-500"
              >
                {t("workspace.aiChatModelSwitch")}
              </label>
              <select
                id="workspace-claude-model"
                value={modelSlot}
                onChange={(e) => setModelSlotAndPersist(e.target.value)}
                className="w-full min-w-0 sm:max-w-md rounded-lg border border-[#324866] bg-[#0d1625] px-2 py-2 text-xs text-zinc-200"
              >
                {modelChoices.map((ch) => (
                  <option key={ch.id} value={ch.id} title={ch.model}>
                    {ch.model}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span>
              {t("workspace.aiChatModel")}: {modelLabel || "—"}
            </span>
            <button
              type="button"
              onClick={() => void loadConfig()}
              className="text-cyan-400 underline hover:text-cyan-300"
            >
              {t("workspace.aiChatRefreshConfig")}
            </button>
            {configured === false ? (
              <span className="text-amber-400/90">{t("workspace.aiChatUnconfigured")}</span>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="shrink-0 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {t("workspace.aiChatError")}: {error}
          </p>
        ) : null}

        <div
          className={cn(
            "min-h-0 max-h-[min(55vh,480px)] space-y-3 self-stretch overflow-y-auto rounded-xl border border-[#1e2a3f] bg-[#121a29] p-3",
            chatFullscreen && "max-h-none min-h-0 flex-1",
          )}
        >
          {activeSession.messages.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("workspace.aiChatEmptyThread")}</p>
          ) : (
            activeSession.messages.map((m, idx) => (
              (() => {
                const messageKey = `${m.createdAt}-${idx}`;
                const copied = copiedMessageKey === messageKey;
                return (
              <div
                key={messageKey}
                className={
                  m.role === "user"
                    ? "ml-4 rounded-lg border border-sky-500/25 bg-sky-950/35 px-3 py-2"
                    : "mr-4 rounded-lg border border-violet-500/25 bg-violet-950/25 px-3 py-2"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {m.role === "user"
                      ? t("workspace.aiChatRoleUser")
                      : t("workspace.aiChatRoleAssistant")}
                  </p>
                  {m.role === "assistant" ? (
                    <button
                      type="button"
                      onClick={() => void copyAssistantMessage(m.content, messageKey)}
                      className="rounded border border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-cyan-400/60 hover:text-cyan-200"
                    >
                      {copied ? t("workspace.aiChatCopied") : t("workspace.aiChatCopy")}
                    </button>
                  ) : null}
                </div>
                {m.role === "assistant" ? (
                  <div
                    className={[
                      "mt-1 min-w-0 text-sm leading-relaxed",
                      "break-words [overflow-wrap:anywhere] text-zinc-200",
                      "[&_p]:mb-2 [&_p]:mt-0 [&_p]:last:mb-0",
                      "[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-zinc-100",
                      "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-zinc-100",
                      "[&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-100",
                      "[&_ul]:my-2 [&_ul]:list-outside [&_ul]:list-disc [&_ul]:pl-5",
                      "[&_ol]:my-2 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:pl-5",
                      "[&_li]:my-0.5",
                      "[&_strong]:font-semibold [&_strong]:text-zinc-50",
                      "[&_em]:text-zinc-200",
                      "[&_hr]:my-3 [&_hr]:border-zinc-600/80",
                      "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-500/50 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-300",
                    ].join(" ")}
                  >
                    <ReaderChapterMarkdown markdown={m.content} />
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{m.content}</p>
                )}
              </div>
                );
              })()
            ))
          )}
          {sending ? (
            <p className="text-xs text-zinc-500">{t("workspace.aiChatWaiting")}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            disabled={sending}
            placeholder={t("workspace.aiChatPlaceholder")}
            className="min-h-[88px] w-full flex-1 resize-y rounded-lg border border-[#324866] bg-[#0d1625] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <button
              type="button"
              disabled={sending || !input.trim()}
              onClick={() => void send()}
              className="rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("workspace.aiChatSend")}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => setInput("")}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-500"
            >
              {t("workspace.aiChatClearInput")}
            </button>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
