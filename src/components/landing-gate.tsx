"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import { useWeb3Auth } from "@/hooks/use-web3-auth";

const cardBase =
  "relative flex min-h-[280px] flex-1 flex-col justify-between rounded-2xl border p-10 transition-shadow";

const cardInner =
  "pointer-events-none text-left [&_*]:pointer-events-none";

const progressTimeline = [
  {
    dateLabel: "2026 年 4 月 5 日（第七天）",
    title: "开发进度",
    items: [
      "优化txt批量导入功能",
      "修改网页前端，增加导航页- 项目介绍与路演。",
      "更新网页首页。",
    ],
  },
  {
    dateLabel: "2026 年 4 月 4 日（第六天）",
    title: "开发进度",
    items: ["有声书上传", "有声书编辑标题/详情", "有声书读者播放"],
  },
  {
    dateLabel: "2026 年 4 月 3 日（第五天）",
    title: "开发进度",
    items: [
      "工单系统-新建页面",
      "AI 生成后人工微调",
      "发布后过长内容撑破页面",
      "英文（或其他翻译语言）阅读时会保留原文图片位置，不再整章丢图",
      "英文语言下仍有中文残留",
      "删不掉卷、节",
      "假设我有六万本小说，那么这个构架带得动吗？",
      "迁移方案",
      "服务一万个作者（每人 100 个读者）与六万本免费书籍的架构承载评估",
      "给工单系统加图片",
    ],
  },
  {
    dateLabel: "2026 年 4 月 2 日（第四天）",
    title: "开发进度",
    items: [
      "只保留一个标题来源",
      "删除默认 AI 角色设定",
      "按照渲染后的格式直接发布",
      "剧情大纲管理",
      "自动先落盘当前章节内容",
      "章节内容错乱修复",
      "章节重复修复",
      "加载中 bug 修复",
      "AI 排版 bug 修复",
      "发布策略分层",
      "文案修改 + AI 赋能自动打标签、写简介",
      "社交媒体作品分享",
      "一键生成抖音视频（前端）",
      "多语言翻译功能",
      "中英夹杂的翻译 bug 修复",
      "翻译的内容分区",
    ],
  },
  {
    dateLabel: "2026 年 4 月 1 日（第三天）",
    title: "功能开发",
    items: [
      "图库功能",
      "章节目录功能",
      "DeepSeek 自动阅读 + 排版 + 切章导入",
      "作品真实标题 bug 修复",
      "一键发布所有章节",
      "章节目录隐藏功能",
      "用户点击变色功能",
      "刷新后记住已读颜色",
      "添加一个 Markdown 编辑器",
      "发布章节只读功能",
      "读者端排版",
      "读者作者展示不同步 bug 修复",
      "读者社交媒体小说分享",
      "读者阅读版本",
      "AI 排版功能",
      "定位 bug 修复",
    ],
  },
  {
    dateLabel: "2026 年 3 月 31 日（第二天）",
    title: "功能开发",
    items: [
      "连接失败帮助弹窗",
      "修改前端页面排版",
      "下一章 tab",
      "财务管理",
      "删除收款码",
      "小说分享功能",
      "读者阅读权限",
      "影响阅读的 bug 修复",
    ],
  },
  {
    dateLabel: "2026 年 3 月 30 日（第一天）",
    title: "已实现的功能",
    items: [
      "前端框架搭建",
      "后端 miroFish 搭建",
      "钱包连接自动识别身份",
      "角色管理",
      "断点记忆恢复",
      "卡片式大纲组件",
      "身份分区",
      "作者管理后台",
      "发布功能",
    ],
  },
] as const;

export function LandingGate() {
  const {
    address,
    isConnected,
    status,
    requestConnect,
    isConnectPending,
  } = useWeb3Auth();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#050810] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% -20%, rgba(56, 189, 248, 0.25), transparent 55%), radial-gradient(ellipse 80% 50% at 100% 50%, rgba(99, 102, 241, 0.12), transparent 50%), radial-gradient(ellipse 60% 40% at 0% 80%, rgba(34, 211, 238, 0.08), transparent 45%), linear-gradient(180deg, #060a14 0%, #0a0f1c 40%, #050810 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Cpath%20fill%3D%22%23182436%22%20fill-opacity%3D%22.35%22%20d%3D%22M0%20h40v40H0z%22%2F%3E%3Cpath%20stroke%3D%22%231e3a5f%22%20stroke-opacity%3D%22.25%22%20d%3D%22M40%200H0v40%22%2F%3E%3C%2Fsvg%3E')] opacity-[0.35]" />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 py-16">
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.35em] text-cyan-400/80">
          Chenchen-Lib
        </p>
        <nav
          className="mb-8 flex flex-wrap items-center justify-center gap-2"
          aria-label="项目介绍与路演"
        >
          <a
            href="/pitch-deck.html"
            className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-zinc-300 transition hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:text-cyan-100"
          >
            路演 / Pitch
          </a>
          <a
            href="/pitch-deck.html"
            className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-zinc-300 transition hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:text-cyan-100"
          >
            郴郴文库介绍
          </a>
        </nav>
        <h1 className="mb-12 text-center text-2xl font-semibold tracking-tight text-white md:text-3xl">
          选择你的身份 · 进入矩阵
        </h1>

        <div className="grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
          <motion.div
            whileHover={{ scale: 1.03, y: -6 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            className="will-change-transform"
          >
            <Link
              href="/workspace"
              className={`${cardBase} block border-cyan-500/35 bg-gradient-to-br from-cyan-950/50 to-slate-950/80 shadow-[0_0_40px_-10px_rgba(34,211,238,0.45)] hover:border-cyan-400/50 hover:shadow-[0_0_56px_-8px_rgba(34,211,238,0.55)]`}
            >
              <div className={cardInner}>
                <span className="text-xs font-medium uppercase tracking-widest text-cyan-300/90">
                  Creator
                </span>
                <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
                  我是作者
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
                  AI 稿面 · 角色与大纲 · 叙事推演
                </p>
              </div>
              <span className="mt-8 inline-flex items-center gap-2 text-xs font-medium text-cyan-400">
                进入工作台
                <span aria-hidden>→</span>
              </span>
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.03, y: -6 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            className="will-change-transform"
          >
            <Link
              href="/library"
              className={`${cardBase} block border-violet-500/35 bg-gradient-to-br from-violet-950/45 to-slate-950/80 shadow-[0_0_40px_-10px_rgba(139,92,246,0.4)] hover:border-violet-400/50 hover:shadow-[0_0_56px_-8px_rgba(139,92,246,0.5)]`}
            >
              <div className={cardInner}>
                <span className="text-xs font-medium uppercase tracking-widest text-violet-300/90">
                  Reader
                </span>
                <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
                  我是读者
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
                  书库与阅读体验（开发中）
                </p>
              </div>
              <span className="mt-8 inline-flex items-center gap-2 text-xs font-medium text-violet-400">
                前往书库
                <span aria-hidden>→</span>
              </span>
            </Link>
          </motion.div>
        </div>

        <section className="mt-12 w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b1320]/90 p-5 backdrop-blur-sm md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white md:text-lg">网站开发进度</h2>
            <span className="text-[11px] text-cyan-300/80">按时间由近到远</span>
          </div>

          <div className="space-y-4">
            {progressTimeline.map((stage) => (
              <article
                key={stage.dateLabel}
                className="rounded-xl border border-[#1f3048] bg-[#0f1a2b] p-4"
              >
                <p className="text-xs font-medium text-cyan-300">{stage.dateLabel}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{stage.title}</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-6 text-zinc-300 md:text-sm">
                  {stage.items.map((item) => (
                    <li key={`${stage.dateLabel}-${item}`}>{item}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-black/20 px-6 py-6 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
          <p className="text-xs text-zinc-500">连接钱包以继续创作与同步</p>
          {isConnected && address ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span
                className="font-mono text-sm text-emerald-100/90"
                title={address}
              >
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isConnectPending || status === "connecting"}
              onClick={() => void requestConnect()}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-orange-500/10 px-5 py-2.5 text-sm font-medium text-amber-100 shadow-[0_0_24px_-6px_rgba(251,191,36,0.4)] transition hover:border-amber-400/60 hover:from-amber-500/25 disabled:opacity-45"
            >
              <MetaMaskGlyph className="h-5 w-5" />
              {isConnectPending || status === "connecting"
                ? "连接中…"
                : "连接钱包以继续 · MetaMask"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function MetaMaskGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="#E17726" d="m36 4-14 10 2.5-6.5z" />
      <path fill="#E27625" d="m4 4 14 10-2.5-6.5z" />
      <path fill="#E27625" d="m31 27.5-3 5 6-1zM9 27.5l-3 5 6-1z" />
      <path fill="#E27625" d="m18 23-1 5 4-9z" />
      <path fill="#E27625" d="m22 23 1 5-4-9z" />
      <path fill="#D7C1B3" d="m18 30 1-7-7 5z" />
      <path fill="#C0AD9E" d="m22 30-1-7 7 5z" />
      <path fill="#233447" d="m12 25 2 5-5-1z" />
      <path fill="#233447" d="m28 25-2 5 5-1z" />
      <path fill="#CD6116" d="m14 14h12l-2 5h-8z" />
      <path fill="#E4751F" d="m14 14-3 8 3-3z" />
      <path fill="#E4751F" d="m26 14 3 8-3-3z" />
      <path fill="#F6851B" d="m19 19-1 9 4 2z" />
      <path fill="#F6851B" d="m21 19 1 9-4 2z" />
      <path fill="#C0AD9E" d="m16 30h8v2l-4 2-4-2z" />
    </svg>
  );
}
