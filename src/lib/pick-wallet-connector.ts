import type { Connector } from "wagmi";

/**
 * 在浏览器环境中优先使用通用 injected，其次 MetaMask 专用连接器，最后回退到列表首项。
 */
export function pickWalletConnector(
  connectors: readonly Connector[],
): Connector | undefined {
  if (!connectors.length) return undefined;
  return (
    connectors.find((c) => c.type === "injected") ??
    connectors.find((c) => c.type === "metaMask") ??
    connectors[0]
  );
}

type EthereumRequestProvider = {
  request: (args: { method: string }) => Promise<unknown>;
};

export function getBrowserEthereumProvider():
  | EthereumRequestProvider
  | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { ethereum?: EthereumRequestProvider };
  return w.ethereum;
}
