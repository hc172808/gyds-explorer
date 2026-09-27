#!/usr/bin/env bash
# Verify a running GYDSChain node without exposing credentials.
#
# Usage:
#   RPC_URL=http://127.0.0.1:8545 bash node-verify.sh
#   RPC_URL=https://rpc.example.com GENESIS_FILE=/etc/gyds/genesis.json bash node-verify.sh

set -uo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
EXPECTED_CHAIN_ID="${EXPECTED_CHAIN_ID:-198282}"
EXPECTED_NETWORK_ID="${EXPECTED_NETWORK_ID:-198282}"
EXPECTED_NATIVE_DECIMALS="${EXPECTED_NATIVE_DECIMALS:-18}"
MIN_PEERS="${MIN_PEERS:-1}"
MIN_DISK_FREE_GB="${MIN_DISK_FREE_GB:-10}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds}"
SERVICE="${SERVICE:-gyds-node}"
GENESIS_FILE="${GENESIS_FILE:-}"

FAILURES=0
fail() { printf 'ERROR: %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }
warn() { printf 'WARN:  %s\n' "$1" >&2; }
hard() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || hard "curl is required."
command -v jq >/dev/null || hard "jq is required."

rpc() {
  local method="$1"
  local params="${2:-[]}"
  curl -fsS --max-time 10 "$RPC_URL" \
    -H 'content-type: application/json' \
    --data "$(jq -cn --arg method "$method" --argjson params "$params" \
      '{jsonrpc:"2.0",method:$method,params:$params,id:1}')"
}

# ---------- Chain identity ----------
CHAIN_HEX="$(rpc eth_chainId | jq -er '.result')" || hard "RPC not reachable at ${RPC_URL}"
NETWORK_ID="$(rpc net_version | jq -er '.result')"
BLOCK_NUMBER="$(rpc eth_blockNumber | jq -er '.result')"
PEERS_HEX="$(rpc net_peerCount | jq -r '.result // "0x0"')"
SYNCING="$(rpc eth_syncing | jq -r '.result')"
GENESIS_HASH="$(rpc eth_getBlockByNumber '["0x0",false]' | jq -r '.result.hash // empty')"

EXPECTED_CHAIN_HEX="$(printf '0x%x' "$EXPECTED_CHAIN_ID")"
[ "$CHAIN_HEX" = "$EXPECTED_CHAIN_HEX" ] || fail "eth_chainId=${CHAIN_HEX}, expected ${EXPECTED_CHAIN_HEX}."
[ "$NETWORK_ID" = "$EXPECTED_NETWORK_ID" ] || fail "net_version=${NETWORK_ID}, expected ${EXPECTED_NETWORK_ID}."
[ "$EXPECTED_NATIVE_DECIMALS" = "18" ] || fail "GYDS native decimals must be 18."

# ---------- Sync status ----------
if [ "$SYNCING" != "false" ]; then
  CURRENT="$(rpc eth_syncing | jq -r '.result.currentBlock // empty')"
  HIGHEST="$(rpc eth_syncing | jq -r '.result.highestBlock // empty')"
  warn "Node is still syncing (current=${CURRENT} highest=${HIGHEST})."
fi

# ---------- Peers ----------
PEERS=$((16#${PEERS_HEX#0x}))
[ "$PEERS" -ge "$MIN_PEERS" ] || fail "peer_count=${PEERS}, expected at least ${MIN_PEERS}."

# ---------- Block progress ----------
BLOCK_A=$((16#${BLOCK_NUMBER#0x}))
sleep 12
BLOCK_B_HEX="$(rpc eth_blockNumber | jq -r '.result // "0x0"')"
BLOCK_B=$((16#${BLOCK_B_HEX#0x}))
if [ "$BLOCK_B" -le "$BLOCK_A" ]; then
  warn "Block height did not advance in 12s (still ${BLOCK_B}) — check validators/peers."
fi

# ---------- Systemd unit ----------
if command -v systemctl >/dev/null; then
  UNIT_STATE="$(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)"
  UNIT_ENABLED="$(systemctl is-enabled "$SERVICE" 2>/dev/null || echo unknown)"
  [ "$UNIT_STATE" = "active" ] || fail "systemd unit ${SERVICE} is ${UNIT_STATE}."
  [ "$UNIT_ENABLED" = "enabled" ] || warn "systemd unit ${SERVICE} is not enabled at boot (${UNIT_ENABLED})."
  printf 'service=%s (%s, %s)\n' "$SERVICE" "$UNIT_STATE" "$UNIT_ENABLED"
fi

# ---------- Disk space ----------
if [ -d "$DATA_DIR" ]; then
  FREE_GB="$(df -BG --output=avail "$DATA_DIR" | tail -1 | tr -dc '0-9')"
  printf 'disk_free_gb=%s (datadir %s)\n' "$FREE_GB" "$DATA_DIR"
  [ "${FREE_GB:-0}" -ge "$MIN_DISK_FREE_GB" ] || fail "Only ${FREE_GB}GB free in ${DATA_DIR}, minimum ${MIN_DISK_FREE_GB}GB."
fi

# ---------- Time sync ----------
if command -v timedatectl >/dev/null; then
  NTP_SYNC="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo unknown)"
  [ "$NTP_SYNC" = "yes" ] || warn "System clock is not NTP-synchronised (chrony) — PoS timing may drift."
  printf 'ntp_synchronized=%s\n' "$NTP_SYNC"
fi

# ---------- Genesis ----------
if [ -n "$GENESIS_FILE" ]; then
  [ -f "$GENESIS_FILE" ] || fail "Genesis file not found: $GENESIS_FILE"
  if [ -f "$GENESIS_FILE" ] && command -v sha256sum >/dev/null; then
    printf 'genesis_sha256=%s\n' "$(sha256sum "$GENESIS_FILE" | awk '{print $1}')"
  fi
fi

printf 'rpc=%s\n' "$RPC_URL"
printf 'chain_id=%s (%s)\n' "$EXPECTED_CHAIN_ID" "$CHAIN_HEX"
printf 'network_id=%s\n' "$NETWORK_ID"
printf 'native_decimals=%s\n' "$EXPECTED_NATIVE_DECIMALS"
printf 'peer_count=%s\n' "$PEERS"
printf 'syncing=%s\n' "$SYNCING"
printf 'latest_block=%s\n' "$BLOCK_B"
[ -n "$GENESIS_HASH" ] && printf 'genesis_hash=%s\n' "$GENESIS_HASH"

if [ "$FAILURES" -gt 0 ]; then
  printf 'status=FAILED (%s check(s))\n' "$FAILURES"
  exit 1
fi
printf 'status=OK\n'
