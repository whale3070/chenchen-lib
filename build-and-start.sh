#!/usr/bin/env bash
# apps/web：依赖安装（可选）→ 生产构建 → next start（前台进程）
#
# ---------------------------------------------------------------------------
# 如何部署（生产）
#
# 1) systemd（推荐，服务只负责「已构建后的启动」）
#    - Unit 里设置 WorkingDirectory=/root/chenchen-lib/apps/web
#    - ExecStart=/usr/bin/npm run start   （或 npx next start -p 3000）
#    - 每次发版：在 apps/web 执行构建，再重启服务，例如：
#        cd /root/chenchen-lib/apps/web && npm run build:safe && systemctl restart chenchenLib
#    - 不要用「每次 restart 都跑完整 build」的 ExecStart；会拖死小内存机。
#
# 2) 仓库自带 deploy/chenchenlib-deploy.sh
#    - 在 APP_DIR 下构建并 systemctl restart；可把其中的 npm run build 改为
#      npm run build:safe，与 package.json 中 build:safe 一致。
#
# 3) 本脚本适合：本机/服务器「一次性」构建并前台跑起来调试；或 CI 产物已同步、
#    仅启动：SKIP_BUILD=1 ./build-and-start.sh
#
# ---------------------------------------------------------------------------
# 环境变量
#   PORT                 监听端口（默认 3000，next start 会读）
#   SKIP_INSTALL=1       跳过 npm ci / npm install
#   SKIP_BUILD=1         跳过构建（需已有 .next）
#   NPM_BUILD_SCRIPT     package.json 里构建脚本名，默认 build:safe
#   NODE_ENV             默认 production
#
set -euo pipefail

cd "$(dirname "$0")"

[[ -f package.json ]] || {
  echo "ERROR: package.json not found (run from apps/web or keep script in repo)." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "ERROR: npm not in PATH" >&2
  exit 1
}

export NODE_ENV="${NODE_ENV:-production}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"

if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
  :
elif [[ ! -d node_modules ]]; then
  echo ">>> 未找到 node_modules，正在 npm ci（若无 lock 请改用 npm install）..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

NPM_BUILD_SCRIPT="${NPM_BUILD_SCRIPT:-build:safe}"

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo ">>> 跳过构建（SKIP_BUILD=1），直接启动..."
else
  echo ">>> 生产构建（npm run ${NPM_BUILD_SCRIPT}）..."
  npm run "${NPM_BUILD_SCRIPT}"
fi

echo ">>> 启动 next start（端口 ${PORT:-3000}，可用 PORT= 覆盖）..."
exec npm run start
