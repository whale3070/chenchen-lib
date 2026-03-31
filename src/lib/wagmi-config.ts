import { createConfig, createStorage, http, noopStorage } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

/** 浏览器内用 localStorage 持久化 wagmi 状态，刷新后自动 reconnect（配合 WagmiProvider reconnectOnMount） */
const browserStorage =
  typeof globalThis !== "undefined" &&
  "localStorage" in globalThis &&
  globalThis.localStorage != null
    ? globalThis.localStorage
    : noopStorage;

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  /* metaMask 与 injected 并存：部分浏览器仅对独立 MetaMask 连接器响应 */
  connectors: [injected(), metaMask()],
  storage: createStorage({ storage: browserStorage }),
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});
