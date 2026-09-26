#!/usr/bin/env bash
# Clone-safe Replit development launcher.
# Starts the local GYDS node, API, and explorer together.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${REPLIT_WEB_PORT:-${PORT:-18680}}"
API_PORT="${REPLIT_API_PORT:-3001}"
RPC_PORT="${REPLIT_RPC_PORT:-18545}"
LITE_RPC_PORT="${REPLIT_LITE_RPC_PORT:-18555}"
STATE_FILE="${REPLIT_TEST_STATE_FILE:-${ROOT_DIR}/.replit-node/test-network/state.json}"

cleanup() {
  trap - EXIT INT TERM
  kill "${NODE_PID:-}" "${LITE_NODE_PID:-}" "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
  wait "${NODE_PID:-}" "${LITE_NODE_PID:-}" "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

node "${ROOT_DIR}/scripts/replit-test-node.mjs" --type rpc --port "${RPC_PORT}" --state "${STATE_FILE}" &
NODE_PID=$!

node "${ROOT_DIR}/scripts/replit-test-node.mjs" --type lite --port "${LITE_RPC_PORT}" --state "${STATE_FILE}" &
LITE_NODE_PID=$!

(
  cd "${ROOT_DIR}"
  PORT="${API_PORT}" \
    REPLIT_NODE_EXTERNAL=1 \
    REPLIT_RPC_URL="http://127.0.0.1:${RPC_PORT}" \
    REPLIT_LITE_RPC_URL="http://127.0.0.1:${LITE_RPC_PORT}" \
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