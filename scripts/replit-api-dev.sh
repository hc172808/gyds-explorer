#!/usr/bin/env bash
# Development entrypoint for the API workflow.
# When the API is started by itself, also start the local test node so the
# existing Replit API/frontend workflows remain self-contained.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_PORT="${REPLIT_RPC_PORT:-18545}"
NODE_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [ -n "${NODE_PID}" ]; then
    kill "${NODE_PID}" 2>/dev/null || true
    wait "${NODE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [ "${REPLIT_NODE_EXTERNAL:-0}" != "1" ]; then
  (
    cd "${ROOT_DIR}"
    REPLIT_NODE_TYPE="${REPLIT_NODE_TYPE:-rpc}" \
      REPLIT_RPC_PORT="${RPC_PORT}" \
      bash scripts/replit-node.sh
  ) &
  NODE_PID=$!
  export REPLIT_RPC_URL="${REPLIT_RPC_URL:-http://127.0.0.1:${RPC_PORT}}"
fi

export NODE_ENV="${NODE_ENV:-development}"
npm run build
npm run start