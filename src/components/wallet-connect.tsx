"use client";

import { useDisconnect } from "wagmi";

import { useWeb3Auth } from "@/hooks/use-web3-auth";

/**
 * 钱包连接（编辑器 / 工作台共用）
 */
export function WalletConnect() {
  const {
    address,
    isConnected,
    status,
    requestConnect,
    isConnectPending,
    connectErrorMessage,
    walletGuideOpen,
    closeWalletGuide,
  } = useWeb3Auth();
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnect();

  const handleConnect = () => {
    void requestConnect();
  };

  if (!isConnected || !address) {
    return (
      <>
        <button
          type="button"
          disabled={isConnectPending || status === "connecting"}
          onClick={handleConnect}
          className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          {isConnectPending || status === "connecting" ? "连接中…" : "连接钱包"}
        </button>
        {walletGuideOpen ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
            role="presentation"
            onClick={closeWalletGuide}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="MetaMask 安装指南"
              className="w-full max-w-xl rounded-2xl border border-[#1e2a3f] bg-[#0a0e17] p-5 text-zinc-200 shadow-[0_0_40px_rgba(79,195,247,0.2)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-[#4fc3f7]">
                连接失败：请先安装 MetaMask
              </h3>
              {connectErrorMessage ? (
                <p className="mt-2 text-xs text-zinc-400">{connectErrorMessage}</p>
              ) : null}
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
                <li>请使用 Chrome 或 Firefox 浏览器访问本站。</li>
                <li>
                  打开 MetaMask 官方下载页：
                  <a
                    href="https://metamask.io/download"
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 text-cyan-400 underline hover:text-cyan-300"
                  >
                    metamask.io/download
                  </a>
                </li>
                <li>安装浏览器扩展后，重启浏览器并刷新页面。</li>
                <li>点击“连接钱包”，在 MetaMask 弹窗中确认连接。</li>
              </ol>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeWalletGuide}
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  const tail6 = address.slice(-6);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="inline-flex max-w-[220px] items-center truncate rounded-lg border border-emerald-500/55 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 shadow-sm dark:border-emerald-500/45 dark:bg-emerald-950/55 dark:text-emerald-300"
        title={address}
      >
        已连接：0x…{tail6}
      </span>
      <button
        type="button"
        disabled={isDisconnecting}
        onClick={() => disconnect()}
        className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        {isDisconnecting ? "断开中…" : "断开连接"}
      </button>
    </div>
  );
}
