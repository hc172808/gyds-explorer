#!/usr/bin/env bash
# Clone-safe Replit development launcher.
# Starts the local GYDS node, API, and explorer together.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${REPLIT_WEB_PORT:-${PORT:-18680}}"
API_PORT="${REPLIT_API_PORT:-3001}"
RPC_PORT="${REPLIT_RPC_PORT:-18545}"

cleanup() {
  trap - EXIT INT TERM
  kill "${NODE_PID:-}" "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
  wait "${NODE_PID:-}" "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd "${ROOT_DIR}"
  REPLIT_NODE_TYPE="${REPLIT_NODE_TYPE:-rpc}" \
    REPLIT_RPC_PORT="${RPC_PORT}" \
    bash scripts/replit-node.sh
) &
NODE_PID=$!

(
  cd "${ROOT_DIR}"
  PORT="${API_PORT}" \
    REPLIT_NODE_EXTERNAL=1 \
    REPLIT_RPC_URL="http://127.0.0.1:${RPC_PORT}" \
    npm run dev --workspace=@workspace/api-server
) &
API_PID=$!

(
  cd "${ROOT_DIR}"
  PORT="${WEB_PORT}" \
    BASE_PATH="${BASE_PATH:-/}" \
    API_SERVER_URL="http://127.0.0.1:${API_PORT}" \
    VITE_RPC_URL="/api/rpc" \
    VITE_RPC_URL_2="/api/rpc" \
    npm run dev --workspace=@workspace/solana-explorer
) &
WEB_PID=$!

wait -n "${NODE_PID}" "${API_PID}" "${WEB_PID}"