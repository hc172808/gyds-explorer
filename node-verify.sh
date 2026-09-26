#!/usr/bin/env bash
# Verify a running GYDSChain node without exposing credentials.
#
# Usage:
#   RPC_URL=http://127.0.0.1:8545 bash node-verify.sh
#   RPC_URL=https://rpc.example.com GENESIS_FILE=/etc/gyds/genesis.json bash node-verify.sh

set -euo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
EXPECTED_CHAIN_ID="${EXPECTED_CHAIN_ID:-198282}"
EXPECTED_NETWORK_ID="${EXPECTED_NETWORK_ID:-198282}"
EXPECTED_NATIVE_DECIMALS="${EXPECTED_NATIVE_DECIMALS:-9}"
GENESIS_FILE="${GENESIS_FILE:-}"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
command -v curl >/dev/null || fail "curl is required."
command -v jq >/dev/null || fail "jq is required."

rpc() {
  local method="$1"
  local params="${2:-[]}"
  curl -fsS --max-time 10 "$RPC_URL" \
    -H 'content-type: application/json' \
    --data "$(jq -cn --arg method "$method" --argjson params "$params" \
      '{jsonrpc:"2.0",method:$method,params:$params,id:1}')"
}

CHAIN_HEX="$(rpc eth_chainId | jq -er '.result')"
NETWORK_ID="$(rpc net_version | jq -er '.result')"
BLOCK_NUMBER="$(rpc eth_blockNumber | jq -er '.result')"
GENESIS_HASH="$(rpc eth_getBlockByNumber '["0x0",false]' | jq -er '.result.hash')" 2>/dev/null || true

EXPECTED_CHAIN_HEX="$(printf '0x%x' "$EXPECTED_CHAIN_ID")"
[ "$CHAIN_HEX" = "$EXPECTED_CHAIN_HEX" ] || fail "eth_chainId=${CHAIN_HEX}, expected ${EXPECTED_CHAIN_HEX}."
[ "$NETWORK_ID" = "$EXPECTED_NETWORK_ID" ] || fail "net_version=${NETWORK_ID}, expected ${EXPECTED_NETWORK_ID}."
[ "$EXPECTED_NATIVE_DECIMALS" = "9" ] || fail "GYDS native decimals must be 9."

if [ -n "$GENESIS_FILE" ]; then
  [ -f "$GENESIS_FILE" ] || fail "Genesis file not found: $GENESIS_FILE"
  command -v sha256sum >/dev/null || fail "sha256sum is required."
  GENESIS_SHA="$(sha256sum "$GENESIS_FILE" | awk '{print $1}')"
  printf 'genesis_sha256=%s\n' "$GENESIS_SHA"
fi

printf 'rpc=%s\n' "$RPC_URL"
printf 'chain_id=%s (%s)\n' "$EXPECTED_CHAIN_ID" "$CHAIN_HEX"
printf 'network_id=%s\n' "$NETWORK_ID"
printf 'native_decimals=%s\n' "$EXPECTED_NATIVE_DECIMALS"
printf 'latest_block=%s\n' "$((16#${BLOCK_NUMBER#0x}))"
[ -n "$GENESIS_HASH" ] && printf 'genesis_hash=%s\n' "$GENESIS_HASH"
printf 'status=OK\n'