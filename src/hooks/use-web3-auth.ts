"use client";

import { useCallback, useState } from "react";
import { useConnect, useConnection, useConnectors, useReconnect } from "wagmi";

import {
  getBrowserEthereumProvider,
  pickWalletConnector,
} from "@/lib/pick-wallet-connector";

const NO_WALLET_ZH =
  "未检测到浏览器钱包（如 MetaMask）。请安装扩展后刷新页面；若已安装，请尝试用 HTTPS 访问本站或使用非隐私模式。";

function formatErr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Web3 身份（wagmi 连接状态 + 连接方法）。
 * 解决：hydrate 前 connectors 为空、以及 wagmi connect 在部分环境下需配合 eth_requestAccounts。
 */
export function useWeb3Auth() {
  const {
    address,
    addresses,
    chainId,
    chain,
    connector,
    isConnected,
    status,
    isConnecting,
    isReconnecting,
    isDisconnected,
  } = useConnection();

  const connectors = useConnectors();
  const { connectAsync, isPending: isConnectPending } = useConnect();
  const { reconnectAsync, isPending: isReconnectPending } = useReconnect();
  const [walletGuideOpen, setWalletGuideOpen] = useState(false);
  const [connectErrorMessage, setConnectErrorMessage] = useState<string | null>(
    null,
  );

  const primaryConnector = pickWalletConnector(connectors);

  const requestConnect = useCallback(async () => {
    setConnectErrorMessage(null);
    const c = pickWalletConnector(connectors);
    if (!c) {
      setConnectErrorMessage(NO_WALLET_ZH);
      setWalletGuideOpen(true);
      return;
    }

    try {
      await connectAsync({ connector: c });
      return;
    } catch (firstErr) {
      const eth = getBrowserEthereumProvider();
      const firstText = formatErr(firstErr);
      if (!eth?.request) {
        setConnectErrorMessage(`连接失败：${firstText}`);
        if (/provider not found|no wallet|metamask/i.test(firstText)) {
          setWalletGuideOpen(true);
        }
        return;
      }
      try {
        await eth.request({ method: "eth_requestAccounts" });
        await reconnectAsync({ connectors: [c] });
      } catch (secondErr) {
        const secondText = formatErr(secondErr);
        setConnectErrorMessage(`连接失败：${secondText}`);
        if (/provider not found|no wallet|metamask/i.test(secondText)) {
          setWalletGuideOpen(true);
        }
      }
    }
  }, [connectAsync, reconnectAsync, connectors]);

  return {
    address,
    addresses,
    chainId,
    chain,
    connector,
    isConnected,
    status,
    isConnecting,
    isReconnecting,
    isDisconnected,
    connectors,
    requestConnect,
    connectErrorMessage,
    walletGuideOpen,
    openWalletGuide: () => setWalletGuideOpen(true),
    closeWalletGuide: () => setWalletGuideOpen(false),
    /** wagmi connect 或 reconnect 任一进行中 */
    isConnectPending: isConnectPending || isReconnectPending,
    primaryConnector,
  };
}
