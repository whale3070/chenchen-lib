#!/usr/bin/env bash
# 在 apps/web 目录下一键启动。
# 默认：next dev（热更新，无需每次 build）
# 生产：WEB_RUN=production 时使用 build:safe + next start（小内存可用 SKIP_BUILD=1）
# Turbopack 若仍报 tailwindcss 解析错误：NEXT_DEV_WEBPACK=1 ./run.sh
set -euo pipefail

cd "$(dirname "$0")"

WEB_RUN="${WEB_RUN:-dev}"
PORT="${PORT:-3000}"

echo ">>> 检查并释放 ${PORT}/tcp …"
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
  mapfile -t _pids < <(lsof -ti tcp:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)
  if ((${#_pids[@]} > 0)); then
    echo ">>> 结束占用 ${PORT} 的进程: ${_pids[*]}"
    kill "${_pids[@]}" 2>/dev/null || true
    sleep 1
    mapfile -t _pids2 < <(lsof -ti tcp:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)
    if ((${#_pids2[@]} > 0)); then
      kill -9 "${_pids2[@]}" 2>/dev/null || true
    fi
  fi
else
  echo ">>> 未找到 fuser/lsof，无法自动释放端口；若启动失败请手动结束占用 ${PORT} 的进程。"
fi

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

if [[ "${WEB_RUN}" == "production" ]]; then
  export NODE_ENV="${NODE_ENV:-production}"
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    echo ">>> 跳过构建（SKIP_BUILD=1）"
  else
    echo ">>> 生产构建（build:safe）..."
    npm run build:safe
  fi
  echo ">>> 启动 next start（端口 ${PORT}）..."
  exec npm run start
fi

export NODE_ENV="${NODE_ENV:-development}"
if [[ "${NEXT_DEV_WEBPACK:-0}" == "1" ]]; then
  echo ">>> 开发模式 next dev --webpack（端口 ${PORT}）..."
  exec npm run dev -- --webpack -p "${PORT}"
fi
echo ">>> 开发模式 next dev（热更新，端口 ${PORT}；生产请设 WEB_RUN=production）..."
exec npm run dev -- -p "${PORT}"
