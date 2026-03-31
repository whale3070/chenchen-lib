import type { NextConfig } from "next";

/**
 * 公网访问请勿长期运行 `next dev`：会拉取 `/_next/webpack-hmr`，经反代时须配置 WebSocket
 * 升级（见本目录 `nginx-websocket-hmr.example.conf`），否则 HMR 失败可导致 Hydration 异常、
 * 钱包等客户端交互异常。生产环境请 `next build && next start`。
 *
 * `allowedDevOrigins`：开发模式下 Next 默认只允许 localhost 访问 `/_next/*` 内部资源；
 * 用域名（如 whale3070.com）打开 dev 时，WebSocket HMR 会因跨站检查返回 403，需显式放行。
 *
 * 浏览器里 CSP「unsafe-eval」类提示多见于开发模式或扩展；生产构建一般不需要在 CSP 中放行 eval。
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ["whale3070.com", "localhost", "127.0.0.1"],
};

export default nextConfig;
