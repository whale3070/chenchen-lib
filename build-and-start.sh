#!/usr/bin/env bash
# 在 apps/web 目录下一键：生产构建 + 启动（适合 4GiB 等小内存机器用 build:safe）
set -euo pipefail

cd "$(dirname "$0")"

export NODE_ENV="${NODE_ENV:-production}"

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

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo ">>> 跳过构建（SKIP_BUILD=1）"
else
  echo ">>> 生产构建（build:safe）..."
  npm run build:safe
fi

echo ">>> 启动 next start（默认端口 3000，可用 PORT=8080 覆盖）..."
exec npm run start
