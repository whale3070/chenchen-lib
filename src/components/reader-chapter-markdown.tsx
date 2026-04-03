"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * 读者正文：GFM（含表格）由 remark-gfm + react-markdown 渲染，与作者端保存的 chapterMarkdown 一致。
 */
const readerMarkdownComponents: Partial<Components> = {
  a: ({ href, children }) => (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-cyan-400 underline decoration-cyan-500/60 hover:text-cyan-300"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 读者正文外链图由作者上传服务提供
    <img
      src={src ?? ""}
      alt={typeof alt === "string" ? alt : ""}
      className="my-3 max-h-[min(70vh,480px)] w-auto max-w-full rounded-md border border-zinc-600/50"
    />
  ),
  table: ({ children }) => (
    <table className="my-4 w-full border-collapse border border-zinc-500/40 text-sm">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="border border-zinc-500/40 bg-zinc-800/70 px-3 py-2 text-left font-semibold text-zinc-100">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-500/40 px-3 py-2 align-top break-words text-zinc-200 [overflow-wrap:anywhere]">
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-zinc-600 bg-zinc-950/80 p-3 text-sm text-zinc-200">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const inline = !className;
    if (inline) {
      return (
        <code className="rounded bg-zinc-800/90 px-1 py-0.5 text-[0.9em] text-cyan-100">
          {children}
        </code>
      );
    }
    return <code className={className}>{children}</code>;
  },
};

export function ReaderChapterMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={readerMarkdownComponents}
    >
      {markdown}
    </ReactMarkdown>
  );
}
