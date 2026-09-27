#!/usr/bin/env bash
# Start a portable GYDS test node inside Replit.
#
# This intentionally avoids apt, sudo, systemd, and /var directories so a
# developer can clone the repository and run it with the Replit Run button.
# The default RPC profile creates a disposable local Clique chain and mines
# blocks for explorer/wallet testing. The lite profile is a lightweight
# full-sync-compatible profile; set REPLIT_LITE_SYNC_MODE=light only when
# connecting to a Geth build that still supports LES light sync.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_TYPE="${REPLIT_NODE_TYPE:-rpc}"
GETH_VERSION="${REPLIT_GETH_VERSION:-1.13.15}"
NODE_DIR="${REPLIT_NODE_DIR:-${ROOT_DIR}/.replit-node/${NODE_TYPE}}"
BIN_DIR="${ROOT_DIR}/.replit-node/bin"
DATA_DIR="${NODE_DIR}/data"
CONFIG_DIR="${NODE_DIR}/config"
GENESIS_FILE="${CONFIG_DIR}/genesis.json"
PASSWORD_FILE="${CONFIG_DIR}/account-password.txt"

case "${NODE_TYPE}" in
  rpc)
    DEFAULT_RPC_PORT=18545
    DEFAULT_WS_PORT=18546
    DEFAULT_P2P_PORT=18547
    ;;
  lite)
    DEFAULT_RPC_PORT=18555
    DEFAULT_WS_PORT=18556
    DEFAULT_P2P_PORT=18557
    ;;
  *)
    echo "REPLIT_NODE_TYPE must be rpc or lite; found '${NODE_TYPE}'." >&2
    exit 1
    ;;
esac

RPC_PORT="${REPLIT_RPC_PORT:-${DEFAULT_RPC_PORT}}"
WS_PORT="${REPLIT_WS_PORT:-${DEFAULT_WS_PORT}}"
P2P_PORT="${REPLIT_P2P_PORT:-${DEFAULT_P2P_PORT}}"
NETWORK_ID="${REPLIT_NETWORK_ID:-198282}"
CHAIN_ID="${REPLIT_CHAIN_ID:-198282}"
BOOTNODE="${REPLIT_BOOTNODE_ENODE:-}"
if [ -n "${REPLIT_NODE_MINE+x}" ]; then
  MINE="${REPLIT_NODE_MINE}"
elif [ "${NODE_TYPE}" = "rpc" ]; then
  MINE=true
else
  MINE=false
fi

log() { printf '[replit-node] %s\n' "$*"; }
warn() { printf '[replit-node] WARNING: %s\n' "$*" >&2; }
die() { printf '[replit-node] ERROR: %s\n' "$*" >&2; exit 1; }

mkdir -p "${BIN_DIR}" "${DATA_DIR}" "${CONFIG_DIR}"

GETH_BIN="$(command -v geth 2>/dev/null || true)"
if [ -z "${GETH_BIN}" ] && [ -x "${BIN_DIR}/geth" ]; then
  GETH_BIN="${BIN_DIR}/geth"
fi

if [ -z "${GETH_BIN}" ]; then
  command -v go >/dev/null 2>&1 || die "Go is required to build the portable Geth binary."
  log "Building Geth ${GETH_VERSION} on first start (cached in .replit-node/bin)..."
  (
    cd "${ROOT_DIR}"
    GOBIN="${BIN_DIR}" \
      GOPROXY="${GOPROXY:-https://proxy.golang.org}" \
      GOSUMDB="${GOSUMDB:-sum.golang.org}" \
      go install "github.com/ethereum/go-ethereum/cmd/geth@v${GETH_VERSION}"
  )
  GETH_BIN="${BIN_DIR}/geth"
fi

[ -x "${GETH_BIN}" ] || die "Geth was not available after installation."

if [ ! -f "${PASSWORD_FILE}" ]; then
  umask 077
  printf '%s\n' "${REPLIT_NODE_PASSWORD:-replit-local-test-password}" > "${PASSWORD_FILE}"
fi

ACCOUNT="$("${GETH_BIN}" account list --datadir "${DATA_DIR}" 2>/dev/null |
  sed -n 's/.*{\([a-fA-F0-9]\{40\}\)}.*/0x\1/p' | head -1 || true)"

if [ -z "${ACCOUNT}" ]; then
  log "Creating the local test account..."
  "${GETH_BIN}" account new --datadir "${DATA_DIR}" --password "${PASSWORD_FILE}" >/dev/null
  ACCOUNT="$("${GETH_BIN}" account list --datadir "${DATA_DIR}" 2>/dev/null |
    sed -n 's/.*{\([a-fA-F0-9]\{40\}\)}.*/0x\1/p' | head -1 || true)"
fi

[ -n "${ACCOUNT}" ] || die "Could not create or find the local test account."

if [ -n "${REPLIT_GENESIS_FILE:-}" ]; then
  [ -f "${REPLIT_GENESIS_FILE}" ] || die "REPLIT_GENESIS_FILE does not exist: ${REPLIT_GENESIS_FILE}"
  cp "${REPLIT_GENESIS_FILE}" "${GENESIS_FILE}"
elif [ ! -f "${GENESIS_FILE}" ]; then
  ACCOUNT_HEX="${ACCOUNT#0x}"
  EXTRA_DATA="0x$(printf '0%.0s' {1..64})${ACCOUNT_HEX}$(printf '0%.0s' {1..130})"
  cat > "${GENESIS_FILE}" <<GENESIS
{
  "config": {
    "chainId": ${CHAIN_ID},
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "istanbulBlock": 0,
    "berlinBlock": 0,
    "londonBlock": 0,
    "clique": { "period": 5, "epoch": 30000 }
  },
  "difficulty": "1",
  "gasLimit": "30000000",
  "extradata": "${EXTRA_DATA}",
  "alloc": {
    "${ACCOUNT}": { "balance": "1000000000000000000000000000" }
  }
}
GENESIS
fi

if [ ! -d "${DATA_DIR}/geth/chaindata" ]; then
  log "Initializing ${NODE_TYPE} chain data..."
  "${GETH_BIN}" init --datadir "${DATA_DIR}" "${GENESIS_FILE}" >/dev/null
fi

if [ -n "${BOOTNODE}" ]; then
  mkdir -p "${DATA_DIR}/geth"
  printf '[\n  "%s"\n]\n' "${BOOTNODE}" > "${DATA_DIR}/geth/static-nodes.json"
elif [ "${NODE_TYPE}" = "lite" ]; then
  warn "No REPLIT_BOOTNODE_ENODE was supplied; the lite profile will start without peers."
fi

GETH_ARGS=(
  --datadir "${DATA_DIR}"
  --networkid "${NETWORK_ID}"
  --port "${P2P_PORT}"
  --nat none
  --http
  --http.addr 0.0.0.0
  --http.port "${RPC_PORT}"
  --http.api eth,net,web3,txpool
  --http.vhosts "*"
  --http.corsdomain "*"
  --ws
  --ws.addr 0.0.0.0
  --ws.port "${WS_PORT}"
  --ws.api eth,net,web3,txpool
  --ws.origins "*"
  --metrics
  --metrics.addr 127.0.0.1
  --metrics.port "$((RPC_PORT + 1000))"
  --verbosity 3
)

if [ "${NODE_TYPE}" = "rpc" ]; then
  GETH_ARGS+=(--syncmode full --gcmode archive)
else
  GETH_ARGS+=(--syncmode "${REPLIT_LITE_SYNC_MODE:-full}" --gcmode full --maxpeers 10)
fi

if [ "${MINE,,}" = "true" ] || [ "${MINE}" = "1" ] || [ "${MINE,,}" = "yes" ]; then
  GETH_ARGS+=(
    --mine
    --miner.etherbase "${ACCOUNT}"
    --unlock "${ACCOUNT}"
    --password "${PASSWORD_FILE}"
    --allow-insecure-unlock
  )
fi

log "Starting ${NODE_TYPE} node on RPC ${RPC_PORT}, WS ${WS_PORT}, P2P ${P2P_PORT}."
log "Explorer RPC proxy: /api/rpc"
exec "${GETH_BIN}" "${GETH_ARGS[@]}"