"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

import type {
  ReaderAiMessage,
  ReaderAiRecommendResponse,
} from "@/types/reader-ai-recommend";

const STORAGE_KEY = "chenchen:reader:ai-recommend:messages:v1";

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

function loadMessages(): ReaderAiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

export function ReaderAiRecommendPanel(props?: { onCollapse?: () => void }) {
  const [messages, setMessages] = useState<ReaderAiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadMessages());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setErr(null);
    const userMsg: ReaderAiMessage = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const nextConv = [...messages, userMsg];
    setMessages(nextConv);
    setInput("");
    setLoading(true);
    try {
      const navLang =
        typeof navigator !== "undefined" ? navigator.language : "en";
      const res = await fetch("/api/v1/library/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextConv,
          locale: navLang,
          siteOrigin:
            typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      const data = (await res.json()) as ReaderAiRecommendResponse & {
        error?: string;
      };
      if (!res.ok && res.status === 429) {
        setErr(data.error ?? "请求过于频繁");
        return;
      }
      const reply =
        data.reply ||
        (data.error
          ? `（服务提示）${data.error}`
          : "暂时无法生成推荐，请稍后重试。");
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        },
      ]);
      if (data.error && !data.reply) setErr(data.error);
    } catch {
      setErr("网络异常，请检查连接后重试。");
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: "网络异常，我暂时无法连接推荐服务。请稍后再试。",
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setErr(null);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050810] text-zinc-200">
      <header className="shrink-0 border-b border-[#1b2b43] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-cyan-300">
            AI 小说推荐助手
          </h2>
          <div className="flex items-center gap-1.5">
            {props?.onCollapse ? (
              <button
                type="button"
                onClick={props.onCollapse}
                className="rounded border border-[#2d405e] px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cyan-500/50 hover:text-cyan-200"
                title="缩小推荐助手"
              >
                缩小
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearChat}
              className="rounded border border-[#2d405e] px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cyan-500/50 hover:text-cyan-200"
            >
              清空对话
            </button>
          </div>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500">
          仅推荐本站书库已公开作品；付费书会说明试读与解锁，免费书会标明免费阅读。不读取钱包与阅读记录。
        </p>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2"
      >
        {messages.length === 0 ? (
          <p className="rounded-lg border border-[#1b2b43] bg-[#0d1524] p-2 text-[11px] text-zinc-400">
            用中文 / English / Español 描述题材、风格、人设或爽点。可说「换一批」「找类似的」「只要免费书 / 只要付费书」等。
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
        {loading ? (
          <p className="text-[11px] text-zinc-500">正在生成推荐…</p>
        ) : null}
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
            placeholder="描述你想读的小说…"
            className="min-w-0 flex-1 rounded-md border border-[#2d405e] bg-[#0a121c] px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-md border border-cyan-500/50 bg-cyan-950/40 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-900/50 disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </footer>
    </div>
  );
}
