#!/usr/bin/env bash
# Development entrypoint for the API workflow.
# When the API is started by itself, also start the local test node so the
# existing Replit API/frontend workflows remain self-contained.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_PORT="${REPLIT_RPC_PORT:-18545}"
LITE_RPC_PORT="${REPLIT_LITE_RPC_PORT:-18555}"
NODE_PIDS=()

cleanup() {
  trap - EXIT INT TERM
  for pid in "${NODE_PIDS[@]:-}"; do
    [ -n "${pid}" ] || continue
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

if [ "${REPLIT_NODE_EXTERNAL:-0}" != "1" ]; then
  STATE_FILE="${REPLIT_TEST_STATE_FILE:-${ROOT_DIR}/.replit-node/test-network/state.json}"
  if [ "${REPLIT_USE_MOCK_NODES:-1}" = "1" ]; then
    node "${ROOT_DIR}/scripts/replit-test-node.mjs" --type rpc --port "${RPC_PORT}" --state "${STATE_FILE}" &
    NODE_PIDS+=("$!")
    node "${ROOT_DIR}/scripts/replit-test-node.mjs" --type lite --port "${LITE_RPC_PORT}" --state "${STATE_FILE}" &
    NODE_PIDS+=("$!")
    export REPLIT_RPC_URL="${REPLIT_RPC_URL:-http://127.0.0.1:${RPC_PORT}}"
    export REPLIT_LITE_RPC_URL="${REPLIT_LITE_RPC_URL:-http://127.0.0.1:${LITE_RPC_PORT}}"
  else
    (
      cd "${ROOT_DIR}"
      REPLIT_NODE_TYPE="${REPLIT_NODE_TYPE:-rpc}" \
        REPLIT_RPC_PORT="${RPC_PORT}" \
        bash scripts/replit-node.sh
    ) &
    NODE_PIDS+=("$!")
    export REPLIT_RPC_URL="${REPLIT_RPC_URL:-http://127.0.0.1:${RPC_PORT}}"
  fi
fi

export NODE_ENV="${NODE_ENV:-development}"
npm run build
npm run start