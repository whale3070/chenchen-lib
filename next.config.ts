import { createRequire } from "node:module";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const webDir = __dirname;
/** Monorepo root (`chenchen-lib/`), where `.env.production` holds ARK_*, DEEPSEEK_*, etc. */
const repoRoot = path.join(__dirname, "..", "..");

/** Turbopack 有时在 `apps/` 而非 `apps/web` 下解析裸导入 `tailwindcss`，显式指向本包 node_modules */
function tailwindcssResolveDir(): string {
  try {
    const require = createRequire(path.join(webDir, "package.json"));
    return path.dirname(require.resolve("tailwindcss/package.json"));
  } catch {
    return path.join(webDir, "node_modules", "tailwindcss");
  }
}
const tailwindcssPkgDir = tailwindcssResolveDir();

// apps/web/.env* first (local overrides), then repo root (canonical production secrets).
loadEnvConfig(webDir);
loadEnvConfig(repoRoot);

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
  /**
   * 仅生产构建需要：把追踪根设到仓库根，便于 serverless 打包到 `shared/` 等目录的资源。
   * 开发模式（Turbopack）下若始终设置此项，PostCSS 解析 `@import "tailwindcss"` 可能从
   * `apps/` 等错误上下文找 `node_modules`，报 Can't resolve 'tailwindcss'。
   */
  ...(process.env.NODE_ENV === "production"
    ? { outputFileTracingRoot: repoRoot }
    : {}),
  /** 修正 Turbopack 对 `@import "tailwindcss"` 的错误解析根（见上注释） */
  turbopack: {
    resolveAlias: {
      tailwindcss: tailwindcssPkgDir,
    },
  },
};

export default nextConfig;
