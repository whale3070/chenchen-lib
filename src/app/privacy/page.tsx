import fs from "node:fs/promises";
import path from "node:path";

import Link from "next/link";

import { ReaderChapterMarkdown } from "@/components/reader-chapter-markdown";

async function readPrivacyMarkdown(): Promise<string> {
  const fp = path.join(process.cwd(), "隐私政策.md");
  try {
    return await fs.readFile(fp, "utf8");
  } catch {
    return "# 隐私政策\n\n隐私政策内容暂不可用，请稍后重试。";
  }
}

export default async function PrivacyPage() {
  const markdown = await readPrivacyMarkdown();
  return (
    <main className="min-h-screen bg-[#050810] py-8 md:py-10">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
        <div className="mb-5 grid grid-cols-3 items-center gap-3">
          <div />
          <h1 className="text-center text-xl font-semibold text-zinc-100">隐私政策</h1>
          <div className="flex justify-end">
            <Link
              href="/"
              className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-200"
            >
              返回首页
            </Link>
          </div>
        </div>

        <article className="rounded-xl border border-[#1e2a3f] bg-[#0b1320] p-4 text-sm leading-7 text-zinc-200 md:p-6">
          <ReaderChapterMarkdown markdown={markdown} />
        </article>
      </div>
    </main>
  );
}

