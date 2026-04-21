"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useMemo } from "react";

import { FloatingReaderAiShell } from "@/components/floating-reader-ai-shell";
import { ReaderAiRecommendPanel } from "@/components/reader-ai-recommend-panel";
import { SiteLocaleControl } from "@/components/site-locale-control";
import { getLandingProgressTimeline } from "@/i18n/landing-progress";
import { useSiteLocale } from "@/providers/site-locale-provider";
import { useWeb3Auth } from "@/hooks/use-web3-auth";

const HOME_AI_MESSAGES_KEY = "chenchen:reader:ai-assistant:home:messages:v1";
const HOME_AI_FLOAT_POS_KEY = "chenchen:reader:home:ai-float-pos:v1";
const HOME_AI_COLLAPSED_KEY = "chenchen:reader:home:ai-assistant-collapsed";

const cardBase =
  "relative flex min-h-[280px] flex-1 flex-col justify-between rounded-2xl border p-10 transition-shadow";

const cardInner =
  "pointer-events-none text-left [&_*]:pointer-events-none";

export function LandingGate() {
  const { t, locale, setLocale } = useSiteLocale();
  const {
    address,
    isConnected,
    status,
    requestConnect,
    isConnectPending,
  } = useWeb3Auth();

  /** 未手动指定语言时由 IP（middleware cookie）推断；已保存 localStorage 或斯道普选择优先。 */
  const tPage = useCallback((key: string) => t(key), [t]);

  const displayLocale = locale;
  const progressTimeline = getLandingProgressTimeline(locale);

  const aiStrings = useMemo(
    () => ({
      title: tPage("aiAssistant.title"),
      dragHint: tPage("aiAssistant.dragHint"),
      collapseLabel: tPage("aiAssistant.collapseLabel"),
      collapseTitle: tPage("aiAssistant.collapseTitle"),
      clear: tPage("aiAssistant.clear"),
      subtitle: tPage("aiAssistant.subtitle"),
      emptyHint: tPage("aiAssistant.emptyHint"),
      placeholder: tPage("aiAssistant.placeholder"),
      send: tPage("aiAssistant.send"),
      loading: tPage("aiAssistant.loading"),
      rateLimit: tPage("aiAssistant.rateLimit"),
      networkError: tPage("aiAssistant.networkError"),
      networkErrorReply: tPage("aiAssistant.networkErrorReply"),
      genericErrorReply: tPage("aiAssistant.genericErrorReply"),
    }),
    [tPage],
  );

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#050810] text-zinc-100">
      {isConnected ? (
        <FloatingReaderAiShell
          positionStorageKey={HOME_AI_FLOAT_POS_KEY}
          collapsedStorageKey={HOME_AI_COLLAPSED_KEY}
          expandButtonTitle={tPage("aiAssistant.expandTitle")}
          expandButtonLabel={tPage("aiAssistant.expandLabel")}
          autoExpandUntilLangOnboardingDone
        >
          {({ onHeaderPointerDown, headerDragging, requestCollapse }) => (
            <ReaderAiRecommendPanel
              storageKey={HOME_AI_MESSAGES_KEY}
              strings={aiStrings}
              onCollapse={requestCollapse}
              onHeaderPointerDown={onHeaderPointerDown}
              headerDragging={headerDragging}
              apiLocale={displayLocale}
              languageOnboarding
              onLocaleInferred={setLocale}
            />
          )}
        </FloatingReaderAiShell>
      ) : null}
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
          className="mb-8 flex flex-wrap items-center justify-center gap-3"
          aria-label={tPage("landing.navAria")}
        >
          <a
            href="/pitch-deck.html"
            className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-zinc-300 transition hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:text-cyan-100"
          >
            {tPage("landing.navPitch")}
          </a>
          <Link
            href="/library/art_f7000ca52e"
            className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-zinc-300 transition hover:border-violet-400/45 hover:bg-violet-500/10 hover:text-violet-100"
          >
            {tPage("landing.navGuide")}
          </Link>
          <SiteLocaleControl
            id="landing-site-ui-locale"
            className="pointer-events-auto rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5"
            selectClassName="border-0 bg-transparent py-0.5"
          />
        </nav>
        <h1 className="mb-4 text-center text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {tPage("landing.heroTitle")}
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-center text-sm leading-relaxed text-zinc-400 md:text-base">
          {tPage("landing.tagline")}
        </p>

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
                  {tPage("landing.creatorBadge")}
                </span>
                <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
                  {tPage("landing.creatorTitle")}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
                  {tPage("landing.creatorDesc")}
                </p>
              </div>
              <span className="mt-8 inline-flex items-center gap-2 text-xs font-medium text-cyan-400">
                {tPage("landing.creatorCta")}
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
                  {tPage("landing.readerBadge")}
                </span>
                <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
                  {tPage("landing.readerTitle")}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
                  {tPage("landing.readerDesc")}
                </p>
              </div>
              <span className="mt-8 inline-flex items-center gap-2 text-xs font-medium text-violet-400">
                {tPage("landing.readerCta")}
                <span aria-hidden>→</span>
              </span>
            </Link>
          </motion.div>
        </div>

        <section
          className="mt-14 w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b1320]/90 p-5 backdrop-blur-sm md:p-6"
          aria-labelledby="landing-about-heading"
        >
          <h2
            id="landing-about-heading"
            className="mb-4 text-center text-base font-semibold text-white md:text-lg"
          >
            {tPage("landing.aboutTitle")}
          </h2>
          <div className="space-y-4 text-sm leading-relaxed text-zinc-300 md:text-[15px]">
            <p>{tPage("landing.aboutP1")}</p>
            <p>{tPage("landing.aboutP2")}</p>
            <p>{tPage("landing.aboutP3")}</p>
          </div>
        </section>

        <section className="mt-12 w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b1320]/90 p-5 backdrop-blur-sm md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white md:text-lg">
              {tPage("landing.progressTitle")}
            </h2>
            <span className="text-[11px] text-cyan-300/80">{tPage("landing.progressOrder")}</span>
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
                    <li key={`${stage.dateLabel}-${item}`}>
                      <ProgressItemWithLinks text={item} />
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-black/20 px-6 py-6 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
          <p className="text-xs text-zinc-500">{tPage("landing.footerHint")}</p>
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
                ? tPage("landing.connecting")
                : tPage("landing.connectWallet")}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function trimUrlTrailingPunct(url: string): string {
  return url.replace(/[.,;:!?）]+$/, "");
}

/** 将条目中的 http(s) URL 渲染为可点击外链（新标签打开） */
function ProgressItemWithLinks({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"'`]+)/gi);
  return (
    <>
      {parts.map((part, i) => {
        if (!/^https?:\/\//i.test(part)) {
          return <span key={i}>{part}</span>;
        }
        const href = trimUrlTrailingPunct(part);
        const tail = part.slice(href.length);
        return (
          <span key={i} className="inline">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-cyan-400 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-300"
            >
              {href}
            </a>
            {tail}
          </span>
        );
      })}
    </>
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
