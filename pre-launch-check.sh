#!/usr/bin/env bash
# GYDS pre-launch verification.
#
# Run this on a node BEFORE promoting it to production. It checks:
#   1. environment sanity (chain/network id, GYDS 18 decimals, required vars)
#   2. required ports are listening on the expected interfaces
#   3. RPC / WS / metrics endpoints respond
#   4. the node has reached the expected sync state (synced, peers, progress)
#
# Usage:
#   sudo bash pre-launch-check.sh
#   ENV_FILE=/etc/gyds/node.env EXPECTED_BLOCK_MIN=1000 bash pre-launch-check.sh
#
# Exit codes: 0 = ready for production, 1 = one or more blocking failures.

set -uo pipefail

ENV_FILE="${ENV_FILE:-/etc/gyds/node.env}"
RPC_URL="${RPC_URL:-}"
SERVICE="${SERVICE:-gyds-node}"
MIN_PEERS="${MIN_PEERS:-1}"
MIN_DISK_FREE_GB="${MIN_DISK_FREE_GB:-10}"
EXPECTED_BLOCK_MIN="${EXPECTED_BLOCK_MIN:-1}"
SYNC_WINDOW_SECONDS="${SYNC_WINDOW_SECONDS:-15}"
MAX_BLOCKS_BEHIND="${MAX_BLOCKS_BEHIND:-2}"

FAILURES=0
WARNINGS=0
pass() { printf '  [ OK ]  %s\n' "$1"; }
fail() { printf '  [FAIL]  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
warn() { printf '  [WARN]  %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }
sect() { printf '\n== %s ==\n' "$1"; }
hard() { printf 'ABORT: %s\n' "$1" >&2; exit 1; }

command -v curl >/dev/null || hard "curl is required (apt install -y curl)."
command -v jq   >/dev/null || hard "jq is required (apt install -y jq)."

# ---------------------------------------------------------------- 1. env sanity
sect "1. Environment sanity"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
  pass "loaded $ENV_FILE"
else
  warn "env file not found at $ENV_FILE — using current environment/defaults"
fi

NODE_TYPE="${NODE_TYPE:-}"
CHAIN_ID="${CHAIN_ID:-}"
NETWORK_ID="${NETWORK_ID:-}"
NATIVE_DECIMALS="${NATIVE_DECIMALS:-}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds}"
CONFIG_DIR="${CONFIG_DIR:-/etc/gyds}"
RPC_PORT="${RPC_PORT:-8545}"
WS_PORT="${WS_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30303}"
METRICS_PORT="${METRICS_PORT:-6060}"
PUBLIC_RPC="${PUBLIC_RPC:-no}"
RPC_URL="${RPC_URL:-http://127.0.0.1:${RPC_PORT}}"

for var in NODE_TYPE CHAIN_ID NETWORK_ID NATIVE_DECIMALS; do
  if [ -z "${!var}" ]; then fail "$var is not set"; else pass "$var=${!var}"; fi
done

case "$NODE_TYPE" in
  main|full|rpc|lite|validator) ;;
  "") ;;
  *) fail "NODE_TYPE=$NODE_TYPE is not one of main|full|rpc|lite|validator" ;;
esac

# GYDS precision is a hard launch gate.
if [ "$NATIVE_DECIMALS" != "18" ]; then
  fail "NATIVE_DECIMALS=$NATIVE_DECIMALS — GYDS must be 18 decimals"
else
  pass "GYDS native decimals = 18"
fi

# Cross-check against the repo chain spec when present.
SPEC="$(dirname "$0")/chain-spec.json"
if [ -f "$SPEC" ]; then
  SPEC_DEC="$(jq -r '.coins.GYDS.decimals // empty' "$SPEC")"
  SPEC_GYD="$(jq -r '.coins.GYD.decimals // empty' "$SPEC")"
  [ "$SPEC_DEC" = "18" ] || fail "chain-spec.json says GYDS decimals=$SPEC_DEC (expected 18)"
  [ "$SPEC_GYD" = "6" ]  || fail "chain-spec.json says GYD decimals=$SPEC_GYD (expected 6)"
  [ "$SPEC_DEC" = "18" ] && [ "$SPEC_GYD" = "6" ] && pass "chain-spec.json matches (GYDS 18 / GYD 6)"
fi

if [ "$CHAIN_ID" != "$NETWORK_ID" ]; then
  warn "CHAIN_ID ($CHAIN_ID) differs from NETWORK_ID ($NETWORK_ID)"
fi

if [ "$NODE_TYPE" = "validator" ] && [ -z "${VALIDATOR_ADDRESS:-}" ]; then
  fail "validator node without VALIDATOR_ADDRESS"
fi
if [ "$NODE_TYPE" != "main" ] && [ -n "$NODE_TYPE" ] && [ -z "${MAIN_NODE_ENODE:-}" ]; then
  fail "$NODE_TYPE node without MAIN_NODE_ENODE — it cannot find peers"
fi

# No secrets in the env file.
if [ -f "$ENV_FILE" ] && grep -Eqi '^(.*_)?(PRIVATE_KEY|PASSWORD|MNEMONIC|SEED)=' "$ENV_FILE"; then
  fail "$ENV_FILE appears to contain a secret (private key / password / mnemonic)"
fi

# Permissions.
if [ -d "$CONFIG_DIR/keystore" ]; then
  PERM="$(stat -c '%a' "$CONFIG_DIR/keystore")"
  [ "$PERM" = "700" ] || fail "keystore dir $CONFIG_DIR/keystore mode is $PERM (expected 700)"
  [ "$PERM" = "700" ] && pass "keystore permissions 700"
fi

if [ -d "$DATA_DIR" ]; then
  FREE_GB="$(df -BG --output=avail "$DATA_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')"
  if [ "${FREE_GB:-0}" -lt "$MIN_DISK_FREE_GB" ]; then
    fail "only ${FREE_GB}GB free in $DATA_DIR (minimum ${MIN_DISK_FREE_GB}GB)"
  else
    pass "disk free ${FREE_GB}GB in $DATA_DIR"
  fi
else
  fail "data dir $DATA_DIR does not exist"
fi

# --------------------------------------------------------------- 2. unit state
sect "2. Service state"
if command -v systemctl >/dev/null; then
  STATE="$(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)"
  ENABLED="$(systemctl is-enabled "$SERVICE" 2>/dev/null || echo unknown)"
  [ "$STATE" = "active" ] && pass "$SERVICE is active" || fail "$SERVICE is $STATE"
  [ "$ENABLED" = "enabled" ] && pass "$SERVICE starts on boot" || fail "$SERVICE is not enabled at boot ($ENABLED)"
  if command -v timedatectl >/dev/null; then
    NTP="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo unknown)"
    [ "$NTP" = "yes" ] && pass "clock NTP-synchronised" || warn "clock not NTP-synchronised — PoS timing may drift"
  fi
else
  warn "systemctl unavailable — skipping service checks"
fi

# -------------------------------------------------------------------- 3. ports
sect "3. Listening ports"
LISTEN=""
if command -v ss >/dev/null; then LISTEN="$(ss -lntup 2>/dev/null)"
elif command -v netstat >/dev/null; then LISTEN="$(netstat -lntup 2>/dev/null)"
else warn "neither ss nor netstat available — skipping port checks"; fi

check_port() { # name port required expect_local
  local name="$1" port="$2" required="$3" expect_local="${4:-no}"
  [ -z "$LISTEN" ] && return 0
  local line
  line="$(printf '%s\n' "$LISTEN" | grep -E "[:.]${port}[[:space:]]" | head -1)"
  if [ -z "$line" ]; then
    if [ "$required" = "yes" ]; then fail "$name port $port is not listening"
    else warn "$name port $port is not listening"; fi
    return 0
  fi
  if [ "$expect_local" = "yes" ] && printf '%s' "$line" | grep -Eq '(0\.0\.0\.0|\*|\[::\]):'"$port"; then
    fail "$name port $port is bound to all interfaces but should be localhost-only"
  else
    pass "$name port $port listening"
  fi
}

if [ "$PUBLIC_RPC" = "yes" ]; then
  check_port "RPC" "$RPC_PORT" yes no
  warn "PUBLIC_RPC=yes — confirm Nginx rate limiting and a method allowlist are in front of $RPC_PORT"
else
  check_port "RPC" "$RPC_PORT" yes yes
fi
check_port "WS"      "$WS_PORT"      no  "$([ "$PUBLIC_RPC" = yes ] && echo no || echo yes)"
check_port "P2P"     "$P2P_PORT"     yes no
check_port "metrics" "$METRICS_PORT" no  yes

# ---------------------------------------------------------------- 4. endpoints
sect "4. Endpoints"
rpc() {
  curl -fsS --max-time 10 "$RPC_URL" -H 'content-type: application/json' \
    --data "$(jq -cn --arg m "$1" --argjson p "${2:-[]}" '{jsonrpc:"2.0",method:$m,params:$p,id:1}')"
}

if ! RESP="$(rpc eth_chainId)"; then
  fail "RPC not reachable at $RPC_URL — remaining chain checks skipped"
  RPC_OK=no
else
  RPC_OK=yes
  CHAIN_HEX="$(printf '%s' "$RESP" | jq -r '.result // empty')"
  EXPECT_HEX="$(printf '0x%x' "${CHAIN_ID:-0}")"
  [ "$CHAIN_HEX" = "$EXPECT_HEX" ] && pass "eth_chainId=$CHAIN_HEX matches CHAIN_ID=$CHAIN_ID" \
    || fail "eth_chainId=$CHAIN_HEX but CHAIN_ID=$CHAIN_ID ($EXPECT_HEX)"

  NETV="$(rpc net_version | jq -r '.result // empty')"
  [ "$NETV" = "$NETWORK_ID" ] && pass "net_version=$NETV" || fail "net_version=$NETV, expected $NETWORK_ID"
fi

if curl -fsS --max-time 5 "http://127.0.0.1:${METRICS_PORT}/debug/metrics" >/dev/null 2>&1 \
   || curl -fsS --max-time 5 "http://127.0.0.1:${METRICS_PORT}/metrics" >/dev/null 2>&1; then
  pass "metrics endpoint responds on 127.0.0.1:${METRICS_PORT}"
else
  warn "metrics endpoint on ${METRICS_PORT} did not respond"
fi

# -------------------------------------------------------------------- 5. sync
sect "5. Sync state"
if [ "$RPC_OK" = "yes" ]; then
  SYNCING="$(rpc eth_syncing | jq -c '.result')"
  if [ "$SYNCING" != "false" ]; then
    CUR="$(printf '%s' "$SYNCING" | jq -r '.currentBlock // "0x0"')"
    HIGH="$(printf '%s' "$SYNCING" | jq -r '.highestBlock // "0x0"')"
    BEHIND=$(( 16#${HIGH#0x} - 16#${CUR#0x} ))
    if [ "$BEHIND" -gt "$MAX_BLOCKS_BEHIND" ]; then
      fail "node is still syncing — $BEHIND blocks behind (max allowed $MAX_BLOCKS_BEHIND). Do not promote."
    else
      pass "syncing but within $MAX_BLOCKS_BEHIND blocks of head"
    fi
  else
    pass "eth_syncing=false (fully synced)"
  fi

  PEERS_HEX="$(rpc net_peerCount | jq -r '.result // "0x0"')"
  PEERS=$(( 16#${PEERS_HEX#0x} ))
  [ "$PEERS" -ge "$MIN_PEERS" ] && pass "peer_count=$PEERS" || fail "peer_count=$PEERS, expected at least $MIN_PEERS"

  A_HEX="$(rpc eth_blockNumber | jq -r '.result // "0x0"')"; A=$(( 16#${A_HEX#0x} ))
  [ "$A" -ge "$EXPECTED_BLOCK_MIN" ] && pass "latest_block=$A (>= $EXPECTED_BLOCK_MIN)" \
    || fail "latest_block=$A is below expected minimum $EXPECTED_BLOCK_MIN"

  printf '  ...waiting %ss to confirm block progress\n' "$SYNC_WINDOW_SECONDS"
  sleep "$SYNC_WINDOW_SECONDS"
  B_HEX="$(rpc eth_blockNumber | jq -r '.result // "0x0"')"; B=$(( 16#${B_HEX#0x} ))
  [ "$B" -gt "$A" ] && pass "block height advanced $A -> $B" \
    || fail "block height stalled at $B over ${SYNC_WINDOW_SECONDS}s"

  GEN="$(rpc eth_getBlockByNumber '["0x0",false]' | jq -r '.result.hash // empty')"
  [ -n "$GEN" ] && pass "genesis_hash=$GEN" || fail "could not read genesis block"
fi

# ------------------------------------------------------------------- verdict
printf '\n== Verdict ==\n'
printf 'node_type=%s chain_id=%s decimals=%s rpc=%s public_rpc=%s\n' \
  "${NODE_TYPE:-?}" "${CHAIN_ID:-?}" "${NATIVE_DECIMALS:-?}" "$RPC_URL" "$PUBLIC_RPC"
printf 'failures=%s warnings=%s\n' "$FAILURES" "$WARNINGS"
if [ "$FAILURES" -gt 0 ]; then
  printf 'status=NOT READY — fix the [FAIL] items above before promoting to production\n'
  exit 1
fi
printf 'status=READY FOR PRODUCTION\n'
