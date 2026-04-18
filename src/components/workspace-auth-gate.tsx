"use client";

import Link from "next/link";
import { useState } from "react";

import { WorkspaceEmailAuth } from "@/components/workspace-email-auth";
import { useWeb3Auth } from "@/hooks/use-web3-auth";
import { useSiteLocale } from "@/providers/site-locale-provider";

type AuthTab = "email" | "wallet";

export function WorkspaceAuthGate() {
  const { t } = useSiteLocale();
  const [tab, setTab] = useState<AuthTab>("email");
  const {
    status,
    requestConnect,
    isConnectPending,
    connectErrorMessage,
    walletGuideOpen,
    closeWalletGuide,
  } = useWeb3Auth();

  const walletCard = (
    <div className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white/80 p-5 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80">
      <div className="mb-4 flex items-center gap-3">
        <MetaMaskGlyph className="h-10 w-10 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("workspace.walletGateTitle")}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {t("workspace.walletGateBlurb")}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={isConnectPending || status === "connecting"}
        onClick={() => void requestConnect()}
        className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-950 shadow-sm transition hover:bg-amber-400 disabled:opacity-50 dark:bg-amber-600 dark:text-amber-50 dark:hover:bg-amber-500"
      >
        {isConnectPending || status === "connecting"
          ? t("wallet.connecting")
          : t("workspace.connectWalletMetaMask")}
      </button>
      <p className="mt-3 text-center text-[11px] text-neutral-500 dark:text-neutral-400">
        {t("workspace.walletGateRefreshHint")}
      </p>
    </div>
  );

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-6 text-neutral-800 dark:text-neutral-100">
      <div className="text-center">
        <p className="text-sm font-medium">{t("workspace.gateTitle")}</p>
        <p className="mt-2 max-w-md text-xs text-neutral-500 dark:text-neutral-400">
          {t("workspace.gateHint")}
        </p>
      </div>

      {/* md+：左右分栏 */}
      <div className="hidden w-full gap-8 md:grid md:grid-cols-2 md:items-stretch">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("workspace.gateTabEmail")}
          </p>
          <WorkspaceEmailAuth variant="embedded" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("workspace.gateTabWallet")}
          </p>
          {walletCard}
        </div>
      </div>

      {/* 小屏：顶部 Tab + 单面板 */}
      <div className="w-full md:hidden">
        <div
          className="w-full rounded-xl border border-neutral-200 bg-white/60 p-1 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50"
          role="tablist"
          aria-label={t("workspace.gateTablistAria")}
        >
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "email"}
              onClick={() => setTab("email")}
              className={
                tab === "email"
                  ? "rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900"
                  : "rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }
            >
              {t("workspace.gateTabEmail")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "wallet"}
              onClick={() => setTab("wallet")}
              className={
                tab === "wallet"
                  ? "rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900"
                  : "rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }
            >
              {t("workspace.gateTabWallet")}
            </button>
          </div>
        </div>

        <div className="mt-4 w-full" role="tabpanel" id="workspace-auth-panel">
          {tab === "email" ? (
            <WorkspaceEmailAuth variant="embedded" />
          ) : (
            walletCard
          )}
        </div>
      </div>

      {walletGuideOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={closeWalletGuide}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("wallet.guideAria")}
            className="w-full max-w-xl rounded-2xl border border-[#1e2a3f] bg-[#0a0e17] p-5 text-zinc-200 shadow-[0_0_40px_rgba(79,195,247,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#4fc3f7]">
              {t("wallet.guideTitle")}
            </h3>
            {connectErrorMessage ? (
              <p className="mt-2 text-xs text-zinc-400">{connectErrorMessage}</p>
            ) : null}
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
              <li>{t("wallet.guideStep1")}</li>
              <li>
                {t("wallet.guideStep2Prefix")}{" "}
                <a
                  href="https://metamask.io/download"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 text-cyan-400 underline hover:text-cyan-300"
                >
                  metamask.io/download
                </a>
              </li>
              <li>{t("wallet.guideStep3")}</li>
              <li>{t("wallet.guideStep4")}</li>
            </ol>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeWalletGuide}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
              >
                {t("wallet.guideOk")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Link
        href="/"
        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-600"
      >
        {t("workspace.backHome")}
      </Link>
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
