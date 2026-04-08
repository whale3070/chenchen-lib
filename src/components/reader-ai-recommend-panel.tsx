"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

import { inferSiteLocaleFromUserText } from "@/lib/infer-site-locale-from-text";
import { READER_AI_LANG_ONBOARDING_DONE_KEY } from "@/lib/reader-ai-lang-onboarding";
import { normalizeUiLocale } from "@/lib/site-locale";
import type {
  ReaderAiMessage,
  ReaderAiRecommendResponse,
} from "@/types/reader-ai-recommend";

const DEFAULT_STORAGE_KEY = "chenchen:reader:ai-recommend:messages:v1";

/** First assistant line after wallet connect (language onboarding not yet completed). */
const LANG_ONBOARDING_FIRST_MESSAGE = "你的母语是什么？";

function ackForUiLocale(loc: string): string {
  if (loc === "en") {
    return (
      "Thanks! I’ve switched the site to **English**. —Sidaopu\n\n" +
      "Ask me for library picks whenever you like (genre, mood, free vs paid, and so on)."
    );
  }
  if (loc === "zh-CN") {
    return (
      "好的，已将网站界面切换为 **简体中文**。——斯道普\n\n" +
      "想找书的话，告诉我题材、风格或偏好即可。"
    );
  }
  return (
    `Thanks! I’ve set the site interface for **${loc}** (UI is machine-translated when needed). —Sidaopu\n\n` +
    "Ask me for library picks whenever you like (genre, mood, free vs paid, and so on)."
  );
}

async function fetchDetectedUiLocale(text: string): Promise<string | null> {
  try {
    const res = await fetch("/api/v1/site/detect-ui-locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = (await res.json()) as { locale?: string | null };
    if (typeof data.locale === "string" && data.locale.trim()) {
      return normalizeUiLocale(data.locale);
    }
    return null;
  } catch {
    return null;
  }
}

function loadMessages(storageKey: string): ReaderAiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .filter(
        (x): x is ReaderAiMessage =>
          x &&
          typeof x === "object" &&
          ((x as ReaderAiMessage).role === "user" ||
            (x as ReaderAiMessage).role === "assistant"),
      )
      .map((x) => ({
        id: typeof x.id === "string" ? x.id : uid(),
        role: x.role === "assistant" ? "assistant" : "user",
        content: typeof x.content === "string" ? x.content : "",
        createdAt:
          typeof x.createdAt === "number" ? x.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

/** 旧缓存里 `Link: /library/...` 转成当前站点可点的绝对链接 Markdown */
function preprocessLegacyAssistantMarkdown(content: string): string {
  if (typeof window === "undefined") return content;
  const origin = window.location.origin;
  return content.replace(
    /(^|\n)(\s*)Link:\s*(\/library\/[^\s]+)/g,
    (_m, lead, spaces, path) => {
      const cleanPath = path.replace(/[。，,.、]+$/u, "");
      const p = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
      const abs = `${origin}${p}`;
      return `${lead}${spaces}**阅读链接**（点击或复制均可）：[${abs}](${abs})`;
    },
  );
}

const recommendMarkdownComponents: Partial<Components> = {
  a: ({ href, children }) => {
    const raw = href ?? "#";
    let sameSite = false;
    if (typeof window !== "undefined") {
      try {
        if (raw.startsWith("/")) sameSite = true;
        else {
          const u = new URL(raw, window.location.origin);
          sameSite = u.origin === window.location.origin;
        }
      } catch {
        sameSite = false;
      }
    }
    return (
      <a
        href={raw}
        {...(!sameSite
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        className="break-all text-cyan-400 underline decoration-cyan-500/60 hover:text-cyan-300"
      >
        {children}
      </a>
    );
  },
  p: ({ children }) => (
    <p className="mb-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-50">{children}</strong>
  ),
  hr: () => <hr className="my-3 border-[#2d405e]" />,
  ul: ({ children }) => (
    <ul className="my-2 list-inside list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-inside list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="break-words [overflow-wrap:anywhere]">{children}</li>,
};

function uid() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type ReaderAiAssistantStrings = {
  title: string;
  dragHint: string;
  collapseLabel: string;
  collapseTitle: string;
  clear: string;
  subtitle: string;
  emptyHint: string;
  placeholder: string;
  send: string;
  loading: string;
  rateLimit: string;
  networkError: string;
  networkErrorReply: string;
  genericErrorReply: string;
};

export type ReaderAiRecommendPanelProps = {
  strings: ReaderAiAssistantStrings;
  onCollapse?: () => void;
  onHeaderPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  headerDragging?: boolean;
  storageKey?: string;
  /** Hint for the recommend API (e.g. zh-CN vs en) */
  apiLocale?: string;
  /** Home: inject English welcome + first reply sets site UI language */
  languageOnboarding?: boolean;
  onLocaleInferred?: (locale: string) => void;
};

export function ReaderAiRecommendPanel(props: ReaderAiRecommendPanelProps) {
  const {
    strings: s,
    storageKey = DEFAULT_STORAGE_KEY,
    apiLocale,
    languageOnboarding = false,
    onLocaleInferred,
  } = props;

  const [messages, setMessages] = useState<ReaderAiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(READER_AI_LANG_ONBOARDING_DONE_KEY) === "1";
    const loaded = loadMessages(storageKey);

    // 仅由「引导完成标记」与本地对话记录决定是否出现问候；不因 chenchen:site:locale 跳过，
    // 否则曾在工作台选过语言的用户会永远看不到斯道普提问。

    if (languageOnboarding && !done && loaded.length === 0) {
      const initial: ReaderAiMessage[] = [
        {
          id: uid(),
          role: "assistant",
          content: LANG_ONBOARDING_FIRST_MESSAGE,
          createdAt: Date.now(),
        },
      ];
      setMessages(initial);
      try {
        localStorage.setItem(storageKey, JSON.stringify(initial));
      } catch {
        /* ignore */
      }
    } else {
      setMessages(loaded);
    }
    hydratedRef.current = true;
  }, [storageKey, languageOnboarding]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, storageKey]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const markOnboardingDone = useCallback(() => {
    try {
      localStorage.setItem(READER_AI_LANG_ONBOARDING_DONE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setErr(null);

    const onboardingDone =
      typeof window !== "undefined" &&
      localStorage.getItem(READER_AI_LANG_ONBOARDING_DONE_KEY) === "1";

    const userMsg: ReaderAiMessage = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };

    if (languageOnboarding && !onboardingDone) {
      let inferred = inferSiteLocaleFromUserText(text);
      if (!inferred) {
        inferred = await fetchDetectedUiLocale(text);
      }
      if (inferred) {
        onLocaleInferred?.(inferred);
        markOnboardingDone();
        setInput("");
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: uid(),
            role: "assistant",
            content: ackForUiLocale(inferred),
            createdAt: Date.now(),
          },
        ]);
        return;
      }
    }

    const nextConv = [...messages, userMsg];
    setMessages(nextConv);
    setInput("");
    setLoading(true);

    const localeHint =
      apiLocale?.trim() ||
      (typeof navigator !== "undefined" ? navigator.language : "en");

    try {
      const res = await fetch("/api/v1/library/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextConv,
          locale: localeHint,
          siteOrigin:
            typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      const data = (await res.json()) as ReaderAiRecommendResponse & {
        error?: string;
      };
      if (!res.ok && res.status === 429) {
        setErr(data.error ?? s.rateLimit);
        return;
      }
      const reply =
        data.reply ||
        (data.error
          ? `（${s.genericErrorReply}）${data.error}`
          : s.genericErrorReply);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        },
      ]);
      if (res.ok && languageOnboarding && !onboardingDone) {
        markOnboardingDone();
      }
      if (data.error && !data.reply) setErr(data.error);
    } catch {
      setErr(s.networkError);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: s.networkErrorReply,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [
    input,
    loading,
    messages,
    s,
    apiLocale,
    languageOnboarding,
    markOnboardingDone,
    onLocaleInferred,
  ]);

  const clearChat = useCallback(() => {
    setErr(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    const done = localStorage.getItem(READER_AI_LANG_ONBOARDING_DONE_KEY) === "1";
    if (languageOnboarding && !done) {
      const initial: ReaderAiMessage[] = [
        {
          id: uid(),
          role: "assistant",
          content: LANG_ONBOARDING_FIRST_MESSAGE,
          createdAt: Date.now(),
        },
      ];
      setMessages(initial);
      try {
        localStorage.setItem(storageKey, JSON.stringify(initial));
      } catch {
        /* ignore */
      }
    } else {
      setMessages([]);
    }
  }, [languageOnboarding, storageKey]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050810] text-zinc-200">
      <header
        className={[
          "shrink-0 border-b border-[#1b2b43] px-3 py-2",
          props?.onHeaderPointerDown
            ? "cursor-grab touch-none select-none active:cursor-grabbing"
            : "",
          props?.headerDragging ? "cursor-grabbing" : "",
        ].join(" ")}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button, a, input, textarea")) {
            return;
          }
          props?.onHeaderPointerDown?.(e);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-cyan-300">
            {s.title}
            {props?.onHeaderPointerDown ? (
              <span className="ml-2 text-[10px] font-normal text-zinc-500">
                {s.dragHint}
              </span>
            ) : null}
          </h2>
          <div className="flex items-center gap-1.5">
            {props?.onCollapse ? (
              <button
                type="button"
                onClick={props.onCollapse}
                className="rounded border border-[#2d405e] px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cyan-500/50 hover:text-cyan-200"
                title={s.collapseTitle}
              >
                {s.collapseLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearChat}
              className="rounded border border-[#2d405e] px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cyan-500/50 hover:text-cyan-200"
            >
              {s.clear}
            </button>
          </div>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500">{s.subtitle}</p>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2"
      >
        {messages.length === 0 ? (
          <p className="rounded-lg border border-[#1b2b43] bg-[#0d1524] p-2 text-[11px] text-zinc-400">
            {s.emptyHint}
          </p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[95%] rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed ${
                m.role === "user"
                  ? "border-cyan-700/40 bg-cyan-900/40 text-cyan-50"
                  : "border-[#1b2b43] bg-[#0d1524] text-zinc-200"
              }`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {m.content}
                </p>
              ) : (
                <div className="break-words [overflow-wrap:anywhere]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={recommendMarkdownComponents}
                  >
                    {preprocessLegacyAssistantMarkdown(m.content)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading ? <p className="text-[11px] text-zinc-500">{s.loading}</p> : null}
        {err ? (
          <p className="text-[11px] text-amber-400/90">{err}</p>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-[#1b2b43] p-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={s.placeholder}
            className="min-w-0 flex-1 rounded-md border border-[#2d405e] bg-[#0a121c] px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-md border border-cyan-500/50 bg-cyan-950/40 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-900/50 disabled:opacity-40"
          >
            {s.send}
          </button>
        </div>
      </footer>
    </div>
  );
}

/** @deprecated Use ReaderAiRecommendPanel */
export const ReaderAiAssistantPanel = ReaderAiRecommendPanel;
