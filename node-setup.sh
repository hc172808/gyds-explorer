#!/bin/bash
# ============================================================
# GYDS Network Node Setup Script
# ============================================================
#
# Sets up GYDS blockchain nodes with the following hierarchy:
#
#   ┌─────────────────────────────────────────────┐
#   │              MAIN NODE (1 only)              │
#   │  - Genesis authority / mining node           │
#   │  - Full blockchain data                      │
#   │  - Peers: manual whitelist                   │
#   └──────────────┬──────────────────────────────┘
#                   │ sync
#   ┌───────────────▼──────────────────────────────┐
#   │         FULL NODES (unlimited)                │
#   │  - Complete chain history                     │
#   │  - Sync from MAIN node                       │
#   │  - Serve lite nodes                           │
#   └──────────────┬──────────────────────────────┘
#                   │ sync
#   ┌───────────────▼──────────────────────────────┐
#   │         LITE NODES (unlimited)                │
#   │  - Headers + recent state only                │
#   │  - Sync from FULL nodes                       │
#   │  - Serve wallets & websites via JSON-RPC      │
#   └──────────────────────────────────────────────┘
#
#   VALIDATOR NODES:
#   - Full nodes that also participate in Clique authority consensus
#   - Sync from MAIN node, submit sealed blocks after authorization
#   - This network is Clique proof-of-authority, not proof-of-stake
#
# Usage:
#   chmod +x node-setup.sh
#   sudo ./node-setup.sh
#   sudo NODE_TYPE=boost ./node-setup.sh
#
# ============================================================

set -e

# ---------- Colors ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[⚠]${NC} $1"; }
err()    { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info()   { echo -e "${CYAN}[ℹ]${NC} $1"; }
header() {
  echo -e "\n${BLUE}══════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}══════════════════════════════════════${NC}\n"
}

# ---------- Pre-flight ----------
if [ "$EUID" -ne 0 ]; then
  err "Please run as root: sudo ./node-setup.sh"
fi

# ---------- Configuration ----------
GETH_VERSION="1.13.15-c5ba367e"
NETWORK_ENV="${NETWORK_ENV:-}"
DATA_DIR="/var/lib/gyds"
CONFIG_DIR="/etc/gyds"
LOG_DIR="/var/log/gyds"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gyds}"
CHAIN_ID=198282
NETWORK_ID=198282
NATIVE_DECIMALS=18
NATIVE_SUPPLY="${NATIVE_SUPPLY:-}"
NATIVE_COIN_NAME="${NATIVE_COIN_NAME:-}"
NATIVE_COIN_SYMBOL="${NATIVE_COIN_SYMBOL:-}"
NODE_NAME="${NODE_NAME:-}"
SERVICE_NAME="gyds-node"
TOOL_PREFIX="gyds"
TESTNET_ADMIN_WALLET="0x6422d12bfaddee5142bfad21b3006a74d09017b1"
NODE_TYPE="${NODE_TYPE:-}"
TESTNET_AUTO_RESET="${TESTNET_AUTO_RESET:-no}"

# Ports
RPC_PORT=8545
WS_PORT=8546
P2P_PORT=30303
METRICS_PORT=6060

# These will be populated based on node type selection
MAIN_NODE_IP=""
MAIN_NODE_ENODE=""
FULL_NODE_IPS=""
VALIDATOR_ADDRESS=""
VALIDATOR_PASSWORD=""
MAIN_ACCOUNT=""

# Admin / founder wallet (MAIN node only). Either supplied by the operator or
# created here as a fresh geth keystore account.
ADMIN_WALLET="${ADMIN_WALLET:-}"
ADMIN_WALLET_LABEL="${ADMIN_WALLET_LABEL:-Founder}"
ADMIN_WALLET_CREATED="no"
ADMIN_SUPPLY="${ADMIN_SUPPLY:-}"                 # Native coins credited to the admin wallet in genesis
EXPLORER_API_URL="${EXPLORER_API_URL:-http://127.0.0.1:3001/api}"
GYDS_RPC_MODE="${GYDS_RPC_MODE:-local}"
GYDS_LOCAL_RPC_URL="${GYDS_LOCAL_RPC_URL:-}"
GYDS_REMOTE_RPC_URL="${GYDS_REMOTE_RPC_URL:-}"
GYDS_REMOTE_RPC_URL_2="${GYDS_REMOTE_RPC_URL_2:-}"

# Public RPC exposure. "no" keeps RPC/WS reachable only from localhost/VPN.
# RPC nodes are public by definition unless the operator explicitly opts out.
PUBLIC_RPC="${PUBLIC_RPC:-}"
# Backups & health monitoring
BACKUP_KEEP="${BACKUP_KEEP:-7}"
HEALTH_MIN_PEERS="${HEALTH_MIN_PEERS:-1}"
HEALTH_STALL_SECONDS="${HEALTH_STALL_SECONDS:-300}"

# ---- Load settings from .env if present --------------------
# Place a .env file next to this script (or at /var/www/gyds-explorer/.env)
# with any of these variables pre-filled to skip the interactive prompts:
#   NODE_TYPE           main | full | lite | rpc | boost | validator
#   MAIN_NODE_IP        IP of the main node
#   MAIN_NODE_ENODE     enode://... URL of the main node
#   FULL_NODE_IPS       comma-separated IPs of full nodes (for lite)
#   BOOTNODE_ENODE      alias for MAIN_NODE_ENODE (used by Admin Dashboard)
#   VALIDATOR_ADDRESS   0x... signing account address (validator only)
#   NATIVE_DECIMALS     native GYDS precision (must remain 18)
#   NATIVE_SUPPLY       genesis GYDS allocation (default 1000000000)
#   GYDS_RPC_MODE       local | remote | auto (explorer connection preference)
#   GYDS_REMOTE_RPC_URL remote RPC URL used by the explorer
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${NETWORK_ENV,,}" = "testnet" ]; then
  ENV_FILES=(
    "${SCRIPT_DIR}/node.testnet.env"
    "/etc/gyds-testnet/node.env"
    "${SCRIPT_DIR}/.env"
    "${SCRIPT_DIR}/node.env"
    "/var/www/gyds-explorer/.env"
    "/etc/gyds/node.env"
  )
else
  ENV_FILES=(
    "${SCRIPT_DIR}/.env"
    "${SCRIPT_DIR}/node.env"
    "/var/www/gyds-explorer/.env"
    "/etc/gyds/node.env"
  )
fi
for ENV_FILE in "${ENV_FILES[@]}"; do
  if [ -f "$ENV_FILE" ]; then
    info "Loading configuration from ${ENV_FILE} ..."
    # Source only key=value lines (skip comments, blanks, complex shell)
    while IFS='=' read -r key val; do
      [[ "$key" =~ ^[[:space:]]*# ]] && continue
      [[ -z "$key" ]] && continue
      val="${val%%#*}"       # strip inline comments
      val="${val%"${val##*[![:space:]]}"}"  # rtrim
      val="${val#\"}" ; val="${val%\"}"     # strip surrounding quotes
      val="${val#\'}" ; val="${val%\'}"
      case "$key" in
        NETWORK_ENV)       [ -n "$NETWORK_ENV" ] || NETWORK_ENV="$val" ;;
        NODE_NAME)          [ -n "$NODE_NAME" ] || NODE_NAME="$val" ;;
        NODE_TYPE)          [ -z "$NODE_TYPE"         ] && NODE_TYPE="$val" ;;
        TESTNET_AUTO_RESET) TESTNET_AUTO_RESET="$val" ;;
        MAIN_NODE_IP)       [ -z "$MAIN_NODE_IP"      ] && MAIN_NODE_IP="$val" ;;
        MAIN_NODE_ENODE)    [ -z "$MAIN_NODE_ENODE"   ] && MAIN_NODE_ENODE="$val" ;;
        BOOTNODE_ENODE)     [ -z "$MAIN_NODE_ENODE"   ] && MAIN_NODE_ENODE="$val" ;;
        FULL_NODE_IPS)      [ -z "$FULL_NODE_IPS"     ] && FULL_NODE_IPS="$val" ;;
        VALIDATOR_ADDRESS)  [ -z "$VALIDATOR_ADDRESS" ] && VALIDATOR_ADDRESS="$val" ;;
        CHAIN_ID)           CHAIN_ID="$val" ;;
        NETWORK_ID)         NETWORK_ID="${val:-$CHAIN_ID}" ;;
        NATIVE_DECIMALS)    NATIVE_DECIMALS="$val" ;;
        NATIVE_COIN_NAME)   NATIVE_COIN_NAME="$val" ;;
        NATIVE_COIN_SYMBOL) NATIVE_COIN_SYMBOL="$val" ;;
        NATIVE_SUPPLY)      NATIVE_SUPPLY="$val" ;;
        RPC_PORT)           RPC_PORT="$val" ;;
        WS_PORT)            WS_PORT="$val" ;;
        P2P_PORT)           P2P_PORT="$val" ;;
        METRICS_PORT)       METRICS_PORT="$val" ;;
        ADMIN_WALLET)       [ -z "$ADMIN_WALLET"       ] && ADMIN_WALLET="$val" ;;
        ADMIN_WALLET_LABEL) ADMIN_WALLET_LABEL="${val:-$ADMIN_WALLET_LABEL}" ;;
        ADMIN_SUPPLY)       ADMIN_SUPPLY="${val:-$ADMIN_SUPPLY}" ;;
        EXPLORER_API_URL)   EXPLORER_API_URL="${val:-$EXPLORER_API_URL}" ;;
        GYDS_RPC_MODE)      GYDS_RPC_MODE="${val:-$GYDS_RPC_MODE}" ;;
        GYDS_LOCAL_RPC_URL) GYDS_LOCAL_RPC_URL="${val:-$GYDS_LOCAL_RPC_URL}" ;;
        GYDS_REMOTE_RPC_URL) GYDS_REMOTE_RPC_URL="${val:-$GYDS_REMOTE_RPC_URL}" ;;
        GYDS_REMOTE_RPC_URL_2) GYDS_REMOTE_RPC_URL_2="${val:-$GYDS_REMOTE_RPC_URL_2}" ;;
        PUBLIC_RPC)         PUBLIC_RPC="${val:-$PUBLIC_RPC}" ;;
        BACKUP_DIR)         BACKUP_DIR="${val:-$BACKUP_DIR}" ;;
        BACKUP_KEEP)        BACKUP_KEEP="${val:-$BACKUP_KEEP}" ;;
        HEALTH_MIN_PEERS)   HEALTH_MIN_PEERS="${val:-$HEALTH_MIN_PEERS}" ;;
        HEALTH_STALL_SECONDS) HEALTH_STALL_SECONDS="${val:-$HEALTH_STALL_SECONDS}" ;;
      esac
    done < "$ENV_FILE"
    break
  fi
done

NETWORK_ENV="${NETWORK_ENV:-mainnet}"
case "${NETWORK_ENV,,}" in
  mainnet)
    NETWORK_ENV="mainnet"
    NATIVE_COIN_NAME="${NATIVE_COIN_NAME:-GYDSChain}"
    NATIVE_COIN_SYMBOL="${NATIVE_COIN_SYMBOL:-GYDS}"
    NATIVE_SUPPLY="${NATIVE_SUPPLY:-1000000000}"
    ADMIN_SUPPLY="${ADMIN_SUPPLY:-1000000}"
    NODE_NAME="${NODE_NAME:-gyds-node}"
    ;;
  testnet)
    NETWORK_ENV="testnet"
    DATA_DIR="/var/lib/gyds-testnet"
    CONFIG_DIR="/etc/gyds-testnet"
    LOG_DIR="/var/log/gyds-testnet"
    BACKUP_DIR="/var/backups/gyds-testnet"
    CHAIN_ID=198281
    NETWORK_ID=198281
    RPC_PORT=9545
    WS_PORT=9546
    P2P_PORT=30304
    METRICS_PORT=6061
    SERVICE_NAME="gyds-node-testnet"
    TOOL_PREFIX="gyds-testnet"
    NATIVE_COIN_NAME="${NATIVE_COIN_NAME:-TGYDS}"
    NATIVE_COIN_SYMBOL="${NATIVE_COIN_SYMBOL:-TGYDS}"
    NATIVE_SUPPLY="${NATIVE_SUPPLY:-1000000}"
    ADMIN_SUPPLY="${ADMIN_SUPPLY:-5000}"
    ADMIN_WALLET="${ADMIN_WALLET:-$TESTNET_ADMIN_WALLET}"
    [ "${ADMIN_WALLET,,}" = "${TESTNET_ADMIN_WALLET,,}" ] || err "Testnet ADMIN_WALLET must match the configured Testnet admin wallet."
    NODE_NAME="${NODE_NAME:-gyds-testnet-main-01}"
    ;;
  *) err "NETWORK_ENV must be mainnet or testnet; found '${NETWORK_ENV}'." ;;
esac

case "${TESTNET_AUTO_RESET,,}" in
  yes|true|1) TESTNET_AUTO_RESET="yes" ;;
  no|false|0|"") TESTNET_AUTO_RESET="no" ;;
  *) err "TESTNET_AUTO_RESET must be yes or no; found '${TESTNET_AUTO_RESET}'." ;;
esac

if [ -n "$NODE_TYPE" ]; then
  info "Pre-loaded NODE_TYPE=${NODE_TYPE} from .env"
fi

# ---------- Chain invariants ----------
[[ "$CHAIN_ID" =~ ^[0-9]+$ ]] || err "CHAIN_ID must be a whole number."
[[ "$NETWORK_ID" =~ ^[0-9]+$ ]] || err "NETWORK_ID must be a whole number."
[[ "$NATIVE_DECIMALS" = "18" ]] || err "NATIVE_DECIMALS must be 18."
[[ "$NATIVE_SUPPLY" =~ ^[0-9]+$ ]] || err "NATIVE_SUPPLY must be a whole number."
[[ "$ADMIN_SUPPLY" =~ ^[0-9]+$ ]] || err "ADMIN_SUPPLY must be a whole number."
EXPECTED_CHAIN_ID=198282
if [ "$NETWORK_ENV" = "testnet" ]; then
  EXPECTED_CHAIN_ID=198281
fi
[ "$CHAIN_ID" = "$EXPECTED_CHAIN_ID" ] || err "${NETWORK_ENV} chain ID must be ${EXPECTED_CHAIN_ID}."
[ "$NETWORK_ID" = "$EXPECTED_CHAIN_ID" ] || err "${NETWORK_ENV} network ID must be ${EXPECTED_CHAIN_ID}."
NATIVE_SUPPLY_VALUE=$((10#${NATIVE_SUPPLY}))
ADMIN_SUPPLY_VALUE=$((10#${ADMIN_SUPPLY}))
if [ "$NETWORK_ENV" = "testnet" ]; then
  [ "$NATIVE_SUPPLY_VALUE" -eq 1000000 ] || err "Testnet NATIVE_SUPPLY must be exactly 1,000,000 TGYDS."
  [ "$ADMIN_SUPPLY_VALUE" -eq 5000 ] || err "Testnet ADMIN_SUPPLY must be exactly 5,000 TGYDS."
else
  [ "$NATIVE_SUPPLY_VALUE" -le 1000000000 ] || err "NATIVE_SUPPLY cannot exceed the 1,000,000,000 GYDS supply target."
fi
[ "$ADMIN_SUPPLY_VALUE" -le "$NATIVE_SUPPLY_VALUE" ] || err "ADMIN_SUPPLY cannot exceed NATIVE_SUPPLY."
ZEROS="$(printf '0%.0s' $(seq 1 "${NATIVE_DECIMALS}"))"
NATIVE_SUPPLY_BASE_UNITS="${NATIVE_SUPPLY_VALUE}${ZEROS}"   # raw EVM base units (18 decimals)
info "${NATIVE_COIN_SYMBOL} native precision: ${NATIVE_DECIMALS} decimals (${NATIVE_SUPPLY_BASE_UNITS} genesis base units)"

if [ -d "${DATA_DIR}/geth/chaindata" ]; then
  err "Refusing to initialize ${NETWORK_ENV}: ${DATA_DIR}/geth/chaindata already exists. This setup will not reset or overwrite an initialized chain."
fi

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║       GYDS Network - Node Setup Script         ║"
echo "╠════════════════════════════════════════════════╣"
echo "║                                                ║"
echo "║   Select node type to install:                 ║"
echo "║                                                ║"
echo "║   1) MAIN      — Primary authority node        ║"
echo "║                  (only ONE per network)        ║"
echo "║                                                ║"
echo "║   2) FULL      — Complete chain replica        ║"
echo "║                  (syncs from Main node)        ║"
echo "║                                                ║"
echo "║   3) LITE      — Lightweight RPC endpoint      ║"
echo "║                  (syncs from Full nodes)       ║"
echo "║                  (wallets & websites connect)  ║"
echo "║                                                ║"
echo "║   4) RPC       — Full synced public RPC node   ║"
echo "║   5) BOOST     — Dedicated RPC failover node   ║"
echo "║   6) VALIDATOR — Full node + consensus         ║"
echo "║                  (syncs from Main, seals)      ║"
echo "║                                                ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
if [ -z "$NODE_TYPE" ]; then
  read -p "Enter choice [1-6]: " NODE_TYPE_CHOICE
  case "$NODE_TYPE_CHOICE" in
    1) NODE_TYPE="main" ;;
    2) NODE_TYPE="full" ;;
    3) NODE_TYPE="lite" ;;
    4) NODE_TYPE="rpc" ;;
    5) NODE_TYPE="boost" ;;
    6) NODE_TYPE="validator" ;;
    *) err "Invalid choice. Please enter 1, 2, 3, 4, 5, or 6." ;;
  esac
else
  case "$NODE_TYPE" in
    main|full|lite|rpc|boost|validator) info "Node type '${NODE_TYPE}' loaded from .env — skipping prompt." ;;
    *) err "Invalid NODE_TYPE '${NODE_TYPE}' in .env. Must be: main, full, lite, rpc, boost, or validator." ;;
  esac
fi

if [ "$TESTNET_AUTO_RESET" = "yes" ] && { [ "$NETWORK_ENV" != "testnet" ] || [ "$NODE_TYPE" != "main" ]; }; then
  err "TESTNET_AUTO_RESET=yes is supported only on the Testnet MAIN node; it never resets Mainnet or other node roles."
fi

if [ -z "${PUBLIC_RPC}" ]; then
  if [ "${NODE_TYPE}" = "rpc" ] || [ "${NODE_TYPE}" = "boost" ]; then
    PUBLIC_RPC="yes"
  else
    PUBLIC_RPC="no"
  fi
fi
case "${PUBLIC_RPC,,}" in
  yes|no) PUBLIC_RPC="${PUBLIC_RPC,,}" ;;
  *) err "PUBLIC_RPC must be yes or no; found '${PUBLIC_RPC}'." ;;
esac
case "${GYDS_RPC_MODE,,}" in
  local|remote|auto) ;;
  *) err "GYDS_RPC_MODE must be local, remote, or auto; found '${GYDS_RPC_MODE}'." ;;
esac

validate_port() {
  local name="$1"
  local value="$2"
  [[ "${value}" =~ ^[0-9]+$ ]] || err "${name} must be a numeric TCP/UDP port; found '${value}'."
  [ "${value}" -ge 1 ] && [ "${value}" -le 65535 ] || \
    err "${name} must be between 1 and 65535; found '${value}'."
}

validate_port "RPC_PORT" "${RPC_PORT}"
validate_port "WS_PORT" "${WS_PORT}"
validate_port "P2P_PORT" "${P2P_PORT}"
validate_port "METRICS_PORT" "${METRICS_PORT}"
if [ "${RPC_PORT}" = "${WS_PORT}" ] || [ "${RPC_PORT}" = "${P2P_PORT}" ] ||
   [ "${RPC_PORT}" = "${METRICS_PORT}" ] || [ "${WS_PORT}" = "${P2P_PORT}" ] ||
   [ "${WS_PORT}" = "${METRICS_PORT}" ] || [ "${P2P_PORT}" = "${METRICS_PORT}" ]; then
  err "RPC_PORT, WS_PORT, P2P_PORT, and METRICS_PORT must all be different."
fi

NODE_NAME="${NODE_NAME:-${TOOL_PREFIX}-${NODE_TYPE}}"

# ---------- Collect Info Based on Node Type ----------
header "Configuration for ${NODE_TYPE^^} node"

read -p "Enter a friendly name for this node [${NODE_NAME}]: " CUSTOM_NAME
NODE_NAME="${CUSTOM_NAME:-$NODE_NAME}"

if [ "$NODE_TYPE" != "main" ]; then
  echo ""
  if [ "$NODE_TYPE" = "full" ] || [ "$NODE_TYPE" = "rpc" ] || [ "$NODE_TYPE" = "boost" ] || [ "$NODE_TYPE" = "validator" ]; then
    info "Full/Validator nodes sync from the MAIN node."
    if [ -z "$MAIN_NODE_IP" ]; then
      read -p "Enter MAIN node IP address: " MAIN_NODE_IP
      [ -z "$MAIN_NODE_IP" ] && err "Main node IP is required for ${NODE_TYPE} nodes."
    else
      info "MAIN_NODE_IP=${MAIN_NODE_IP} (loaded from .env)"
    fi
    if [ -z "$MAIN_NODE_ENODE" ]; then
      read -p "Enter MAIN node enode URL (or press Enter to skip): " MAIN_NODE_ENODE
    else
      info "MAIN_NODE_ENODE loaded from .env (bootnode configured automatically)"
    fi
  elif [ "$NODE_TYPE" = "lite" ]; then
    info "Lite nodes sync from FULL nodes."
    if [ -z "$FULL_NODE_IPS" ]; then
      read -p "Enter FULL node IP address(es) (comma-separated for multiple): " FULL_NODE_IPS
      [ -z "$FULL_NODE_IPS" ] && err "At least one Full node IP is required for lite nodes."
    else
      info "FULL_NODE_IPS=${FULL_NODE_IPS} (loaded from .env)"
    fi
    # Also accept a BOOTNODE_ENODE / MAIN_NODE_ENODE for lite nodes
    if [ -z "$MAIN_NODE_ENODE" ]; then
      read -p "Enter a FULL node enode URL for peering (or press Enter to skip): " MAIN_NODE_ENODE
    else
      info "Bootnode enode loaded from .env"
    fi
  fi
fi

if [ "$NODE_TYPE" = "main" ]; then
  echo ""
  info "The MAIN node registers the first admin (founder) wallet for the explorer."
  info "This wallet can sign in to the Admin Dashboard and authorize other admins."
  if [ -n "$ADMIN_WALLET" ]; then
    info "ADMIN_WALLET=${ADMIN_WALLET} (loaded from .env)"
  else
    read -p "Enter admin wallet address (0x...), or press Enter to create a new one: " ADMIN_WALLET
  fi
  ADMIN_WALLET="$(echo "${ADMIN_WALLET}" | tr -d '[:space:]')"
  if [ -n "$ADMIN_WALLET" ] && ! [[ "$ADMIN_WALLET" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    err "Invalid admin wallet address: ${ADMIN_WALLET} (expected 0x + 40 hex characters)"
  fi
  if [ -z "$ADMIN_WALLET" ]; then
    info "No address given — a new admin wallet will be created on this server."
  fi
  read -p "Label for this admin wallet [${ADMIN_WALLET_LABEL}]: " CUSTOM_ADMIN_LABEL
  ADMIN_WALLET_LABEL="${CUSTOM_ADMIN_LABEL:-$ADMIN_WALLET_LABEL}"
fi


if [ "$NODE_TYPE" = "validator" ]; then
  echo ""
  info "Validator nodes need a signing account."
  if [ -z "$VALIDATOR_ADDRESS" ]; then
    read -p "Enter validator account address (0x...), or press Enter to create one: " VALIDATOR_ADDRESS
  else
    info "VALIDATOR_ADDRESS=${VALIDATOR_ADDRESS} (loaded from .env)"
  fi
  if [ -z "$VALIDATOR_PASSWORD" ]; then
    read -s -p "Enter validator account password: " VALIDATOR_PASSWORD
    echo ""
    [ -z "$VALIDATOR_PASSWORD" ] && err "Validator account password is required."
  fi
fi

# ============================================================
# STEP 1: System Dependencies
# ============================================================
header "Step 1/9: Installing System Dependencies"

apt-get update -y
apt-get install -y curl wget git build-essential software-properties-common \
  apt-transport-https ca-certificates openssl ufw jq chrony logrotate bc

log "System dependencies installed."

# ============================================================
# STEP 2: Install Geth (Go-Ethereum)
# ============================================================
header "Step 2/9: Installing Geth"

install_geth_from_ppa() {
  add-apt-repository -y ppa:ethereum/ethereum 2>/dev/null && \
  apt-get update -y && \
  apt-get install -y ethereum
}

install_geth_from_binary() {
  local ARCH
  ARCH=$(dpkg --print-architecture)
  # Map debian arch names to geth release names
  case "$ARCH" in
    amd64)  GETH_ARCH="amd64" ;;
    arm64)  GETH_ARCH="arm64" ;;
    *)      GETH_ARCH="$ARCH" ;;
  esac
  local GETH_URL="https://gethstore.blob.core.windows.net/builds/geth-linux-${GETH_ARCH}-${GETH_VERSION}.tar.gz"
  info "Downloading geth ${GETH_VERSION} for ${GETH_ARCH}..."
  cd /tmp
  wget -q --show-progress "${GETH_URL}" -O geth.tar.gz || return 1
  tar xzf geth.tar.gz
  cp "geth-linux-${GETH_ARCH}-${GETH_VERSION}/geth" /usr/local/bin/geth
  chmod +x /usr/local/bin/geth
  hash -r
  rm -rf geth.tar.gz "geth-linux-${GETH_ARCH}-${GETH_VERSION}"
  cd - >/dev/null
}

if command -v geth &>/dev/null; then
  warn "Geth already installed: $(geth version 2>/dev/null | sed -n '1,2p' | tr '\n' ' ')"
elif [ "$NODE_TYPE" = "main" ] || [ "$NODE_TYPE" = "validator" ]; then
  info "Installing project-compatible Geth ${GETH_VERSION} for ${NODE_TYPE^^} block sealing..."
  install_geth_from_binary || err "Could not download the project-compatible Geth ${GETH_VERSION} required by ${NODE_TYPE^^} nodes."
else
  info "Installing geth..."
  install_geth_from_ppa || {
    warn "PPA install failed, trying direct binary download..."
    install_geth_from_binary || {
      warn "Binary download failed. Trying apt fallback..."
      apt-get install -y ethereum 2>/dev/null || true
    }
  }
fi

if [ "$NODE_TYPE" = "validator" ]; then
  [[ -z "${VALIDATOR_ADDRESS}" || "${VALIDATOR_ADDRESS}" =~ ^0x[a-fA-F0-9]{40}$ ]] || \
    err "VALIDATOR_ADDRESS must be a 40-hex-character address beginning with 0x."
fi

if command -v geth &>/dev/null; then
  log "Geth installed: $(geth version 2>/dev/null | sed -n '1,2p' | tr '\n' ' ')"
else
  err "Geth could not be installed. Please install it manually from https://geth.ethereum.org/downloads and re-run this script."
fi

# MAIN and validator nodes use Clique block sealing via Geth's --mine flag.
# Recent upstream Geth builds removed this option, so reject incompatible
# pre-installed or PPA-provided binaries before creating a systemd unit that
# would immediately crash-loop.
if [ "$NODE_TYPE" = "main" ] || [ "$NODE_TYPE" = "validator" ]; then
  GETH_BIN="$(command -v geth)"
  GETH_HELP_OUTPUT="$("${GETH_BIN}" --help 2>&1 || true)"
  if ! [[ "${GETH_HELP_OUTPUT}" =~ (^|[[:space:]])--mine([[:space:]]|$) ]]; then
    GETH_INSTALLED_VERSION="$("${GETH_BIN}" version 2>/dev/null | sed -n '1,2p' | tr '\n' ' ' || true)"
    err "Geth at ${GETH_BIN} (${GETH_INSTALLED_VERSION:-version unavailable}) does not support --mine, which is required for ${NODE_TYPE^^} nodes. Refusing to create a node service that cannot start. Use the guarded helper: sudo bash ${SCRIPT_DIR}/scripts/fix-gyds-enode.sh. It validates the project-compatible Geth ${GETH_VERSION} and asks before replacing the installed binary."
  fi
fi

# ============================================================
# STEP 3: Create Directories & System User
# ============================================================
header "Step 3/9: Setting Up Directories"

mkdir -p "${DATA_DIR}" "${CONFIG_DIR}" "${LOG_DIR}"

# Create a dedicated system user for running the node (no login shell)
if ! id -u gyds &>/dev/null; then
  useradd --system --no-create-home --shell /bin/false gyds
  log "System user 'gyds' created."
else
  warn "System user 'gyds' already exists."
fi

chown -R root:root "${CONFIG_DIR}"
chown -R gyds:gyds "${DATA_DIR}" "${LOG_DIR}"

log "Directories ready: ${DATA_DIR}, ${CONFIG_DIR}, ${LOG_DIR}"

if [ "$NODE_TYPE" = "validator" ]; then
  # The node service signs blocks with a local geth keystore account. Never
  # accept an address that is not actually available to the service.
  printf '%s\n' "${VALIDATOR_PASSWORD}" > "${CONFIG_DIR}/validator-password.txt"
  chmod 600 "${CONFIG_DIR}/validator-password.txt"

  if [ -z "${VALIDATOR_ADDRESS}" ]; then
    if geth account list --datadir "${DATA_DIR}" 2>/dev/null | grep -qE '0x[a-fA-F0-9]{40}'; then
      err "A validator keystore already exists. Re-run with VALIDATOR_ADDRESS set to the existing account."
    fi
    ACCOUNT_OUTPUT=$(geth account new --datadir "${DATA_DIR}" --password "${CONFIG_DIR}/validator-password.txt" 2>&1)
    VALIDATOR_ADDRESS=$(echo "${ACCOUNT_OUTPUT}" | grep -oE '0x[a-fA-F0-9]{40}' | head -1)
    [ -n "${VALIDATOR_ADDRESS}" ] || err "Failed to create the validator account. Output was:\n${ACCOUNT_OUTPUT}"
    log "Validator account created: ${VALIDATOR_ADDRESS}"
  elif ! geth account list --datadir "${DATA_DIR}" 2>/dev/null | grep -qi "${VALIDATOR_ADDRESS#0x}"; then
    err "Validator account ${VALIDATOR_ADDRESS} is not in ${DATA_DIR}/keystore. Import the account there, then rerun."
  fi
fi

# ============================================================
# STEP 4: Genesis File Configuration
# ============================================================
header "Step 4/9: Chain Configuration"

if [ "$NODE_TYPE" = "main" ]; then
  info "Generating a new account for the MAIN node authority..."

  ACCOUNT_PASSWORD=$(openssl rand -base64 16)
  echo "${ACCOUNT_PASSWORD}" > "${CONFIG_DIR}/account-password.txt"
  chmod 600 "${CONFIG_DIR}/account-password.txt"

  ACCOUNT_OUTPUT=$(geth account new --datadir "${DATA_DIR}" --password "${CONFIG_DIR}/account-password.txt" 2>&1)
  MAIN_ACCOUNT=$(echo "${ACCOUNT_OUTPUT}" | grep -oE '0x[a-fA-F0-9]{40}' | head -1)

  if [ -z "$MAIN_ACCOUNT" ]; then
    err "Failed to create a geth account. Output was:\n${ACCOUNT_OUTPUT}"
  fi

  info "Main node authority account: ${MAIN_ACCOUNT}"

  # ---------- Admin / founder wallet ----------
  if [ -z "$ADMIN_WALLET" ]; then
    info "Creating a new admin (founder) wallet..."
    ADMIN_PASSWORD=$(openssl rand -base64 16)
    printf '%s\n' "${ADMIN_PASSWORD}" > "${CONFIG_DIR}/admin-password.txt"
    chmod 600 "${CONFIG_DIR}/admin-password.txt"
    ADMIN_OUTPUT=$(geth account new --datadir "${DATA_DIR}" --password "${CONFIG_DIR}/admin-password.txt" 2>&1)
    ADMIN_WALLET=$(echo "${ADMIN_OUTPUT}" | grep -oE '0x[a-fA-F0-9]{40}' | head -1)
    [ -n "$ADMIN_WALLET" ] || err "Failed to create the admin wallet. Output was:\n${ADMIN_OUTPUT}"
    ADMIN_WALLET_CREATED="yes"
    log "Admin wallet created: ${ADMIN_WALLET}"
    warn "Keystore: ${DATA_DIR}/keystore  •  Password: ${CONFIG_DIR}/admin-password.txt"
    warn "Export this key and back it up — it controls the Admin Dashboard."
  else
    log "Using operator-supplied admin wallet: ${ADMIN_WALLET}"
  fi

  # Split the fixed genesis supply between the authority and admin accounts.
  # The admin allocation is part of NATIVE_SUPPLY, never additional issuance.
  MAIN_GENESIS_SUPPLY="${NATIVE_SUPPLY_VALUE}"
  ADMIN_ALLOC_ENTRY=""
  if [ "${ADMIN_WALLET,,}" != "${MAIN_ACCOUNT,,}" ] && [ "${ADMIN_SUPPLY_VALUE}" -gt 0 ]; then
    MAIN_GENESIS_SUPPLY=$((NATIVE_SUPPLY_VALUE - ADMIN_SUPPLY_VALUE))
    ADMIN_SUPPLY_BASE_UNITS="${ADMIN_SUPPLY_VALUE}${ZEROS}"
    ADMIN_ALLOC_ENTRY=",
    \"${ADMIN_WALLET}\": {
      \"balance\": \"${ADMIN_SUPPLY_BASE_UNITS}\"
    }"
    info "Genesis allocation split: ${MAIN_GENESIS_SUPPLY} GYDS to the authority and ${ADMIN_SUPPLY_VALUE} GYDS to the admin wallet."
  fi
  MAIN_SUPPLY_BASE_UNITS="${MAIN_GENESIS_SUPPLY}${ZEROS}"

  # Build extradata: 32 zero bytes + 20-byte signer address (no 0x) + 65 zero bytes
  SIGNER_HEX="${MAIN_ACCOUNT:2}"   # strip leading 0x
  EXTRA_DATA="0x$(printf '0%.0s' {1..64})${SIGNER_HEX}$(printf '0%.0s' {1..130})"

  cat > "${CONFIG_DIR}/genesis.json" <<GENESIS
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
    "clique": {
      "period": 5,
      "epoch": 30000
    }
  },
  "difficulty": "1",
  "gasLimit": "30000000",
  "extradata": "${EXTRA_DATA}",
  "alloc": {
    "${MAIN_ACCOUNT}": {
      "balance": "${MAIN_SUPPLY_BASE_UNITS}"
    }${ADMIN_ALLOC_ENTRY}
  }
}
GENESIS

  log "Genesis file created: ${CONFIG_DIR}/genesis.json"

  info "Initializing blockchain data directory..."
  geth init --datadir "${DATA_DIR}" "${CONFIG_DIR}/genesis.json"
  log "Blockchain initialized."

else
  info "For ${NODE_TYPE} nodes, genesis.json must exactly match the MAIN node."

  if [ -f "${CONFIG_DIR}/genesis.json" ]; then
    warn "Existing genesis.json found at ${CONFIG_DIR}/genesis.json — using it."
  else
    echo ""
    read -p "Path to genesis.json copied from the MAIN node (or press Enter to use placeholder): " GENESIS_PATH

    if [ -n "$GENESIS_PATH" ] && [ -f "$GENESIS_PATH" ]; then
      cp "$GENESIS_PATH" "${CONFIG_DIR}/genesis.json"
      log "Genesis file copied from ${GENESIS_PATH}."
    else
      err "A verified genesis.json from the MAIN node is required. Refusing to initialize from a placeholder."
    fi

    GENESIS_CHAIN_ID=$(jq -r '.config.chainId // empty' "${CONFIG_DIR}/genesis.json" 2>/dev/null || true)
    [ "$GENESIS_CHAIN_ID" = "$CHAIN_ID" ] || err "Genesis chainId ${GENESIS_CHAIN_ID:-missing} does not match ${CHAIN_ID}."

    geth init --datadir "${DATA_DIR}" "${CONFIG_DIR}/genesis.json"
    log "Blockchain initialized with genesis."
  fi
fi

# ============================================================
# STEP 5: Write Node Environment Configuration
# ============================================================
header "Step 5/9: Environment Configuration"

SERVER_IP=$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

cat > "${CONFIG_DIR}/node.env" <<NODEENV
# ============================================================
# GYDS Node Configuration
# Auto-generated by node-setup.sh on $(date)
# ============================================================

# ---------- Node Identity ----------
NODE_TYPE=${NODE_TYPE}
NODE_NAME=${NODE_NAME}
NODE_IP=${SERVER_IP}

# ---------- Chain Settings ----------
NETWORK_ENV=${NETWORK_ENV}
CHAIN_ID=${CHAIN_ID}
NETWORK_ID=${NETWORK_ID}
TESTNET_AUTO_RESET=${TESTNET_AUTO_RESET}
TESTNET_RESET_REQUEST_FILE=${DATA_DIR}/testnet-reset.request
GETH_BIN=${GETH_BIN:-$(command -v geth)}
NATIVE_DECIMALS=${NATIVE_DECIMALS}
NATIVE_COIN_NAME=${NATIVE_COIN_NAME}
NATIVE_COIN_SYMBOL=${NATIVE_COIN_SYMBOL}
NATIVE_SUPPLY=${NATIVE_SUPPLY}
NATIVE_SUPPLY_BASE_UNITS=${NATIVE_SUPPLY_BASE_UNITS}
ADMIN_SUPPLY=${ADMIN_SUPPLY}

# ---------- Directories ----------
DATA_DIR=${DATA_DIR}
CONFIG_DIR=${CONFIG_DIR}
LOG_DIR=${LOG_DIR}

# ---------- Ports ----------
RPC_PORT=${RPC_PORT}
WS_PORT=${WS_PORT}
P2P_PORT=${P2P_PORT}
METRICS_PORT=${METRICS_PORT}

# ---------- Explorer connection ----------
GYDS_RPC_MODE=${GYDS_RPC_MODE}
GYDS_LOCAL_RPC_URL=${GYDS_LOCAL_RPC_URL:-http://127.0.0.1:${RPC_PORT}}
GYDS_REMOTE_RPC_URL=${GYDS_REMOTE_RPC_URL}
GYDS_REMOTE_RPC_URL_2=${GYDS_REMOTE_RPC_URL_2}

# ---------- Peer Configuration ----------
MAIN_NODE_IP=${MAIN_NODE_IP}
MAIN_NODE_ENODE=${MAIN_NODE_ENODE}
FULL_NODE_IPS=${FULL_NODE_IPS}

# ---------- Validator Settings ----------
VALIDATOR_ADDRESS=${VALIDATOR_ADDRESS}

# ---------- Admin / Founder Wallet (main node) ----------
MAIN_ACCOUNT=${MAIN_ACCOUNT}
ADMIN_WALLET=${ADMIN_WALLET}
ADMIN_WALLET_LABEL=${ADMIN_WALLET_LABEL}

# ---------- Performance ----------
CACHE_SIZE=1024
MAX_PEERS=50

# ---------- Security ----------
# yes = RPC/WS ports opened to the internet, no = localhost/VPN only
PUBLIC_RPC=${PUBLIC_RPC}

# ---------- Backups & health ----------
BACKUP_DIR=${BACKUP_DIR}
BACKUP_KEEP=${BACKUP_KEEP}
HEALTH_MIN_PEERS=${HEALTH_MIN_PEERS}
HEALTH_STALL_SECONDS=${HEALTH_STALL_SECONDS}
NODEENV

chmod 600 "${CONFIG_DIR}/node.env"

# Write validator password file if applicable
if [ "$NODE_TYPE" = "validator" ] && [ -n "$VALIDATOR_PASSWORD" ]; then
  echo "${VALIDATOR_PASSWORD}" > "${CONFIG_DIR}/validator-password.txt"
  chmod 600 "${CONFIG_DIR}/validator-password.txt"
fi

log "Environment written to ${CONFIG_DIR}/node.env"

# ---------- Register the admin wallet with the explorer ----------
if [ "$NODE_TYPE" = "main" ] && [ -n "$ADMIN_WALLET" ]; then
  info "Registering admin wallet with the explorer API (${EXPLORER_API_URL}) ..."
  BOOTSTRAP_CODE=$(curl -s -o /tmp/gyds-bootstrap.json -w '%{http_code}' \
    --max-time 10 -X POST "${EXPLORER_API_URL%/}/admin/wallets/bootstrap" \
    -H 'Content-Type: application/json' \
    -d "{\"walletAddress\":\"${ADMIN_WALLET}\",\"label\":\"${ADMIN_WALLET_LABEL}\"}" 2>/dev/null || echo "000")

  case "$BOOTSTRAP_CODE" in
    200|201) log "Admin wallet registered — sign in at /admin with this wallet." ;;
    403|409)
      warn "Explorer already has admin wallets configured."
      warn "Add this one from the Admin Dashboard, or run directly on the DB host:"
      echo "  psql \"\$DATABASE_URL\" -c \"INSERT INTO admin_wallets (wallet_address,label) VALUES ('${ADMIN_WALLET,,}','${ADMIN_WALLET_LABEL}') ON CONFLICT DO NOTHING;\""
      ;;
    *)
      warn "Could not reach the explorer API (HTTP ${BOOTSTRAP_CODE}). Register later with:"
      echo "  curl -X POST ${EXPLORER_API_URL%/}/admin/wallets/bootstrap \\"
      echo "       -H 'Content-Type: application/json' \\"
      echo "       -d '{\"walletAddress\":\"${ADMIN_WALLET}\",\"label\":\"${ADMIN_WALLET_LABEL}\"}'"
      ;;
  esac
  rm -f /tmp/gyds-bootstrap.json
fi


# ============================================================
# STEP 6: Build Geth Command & Create Systemd Service
# ============================================================
header "Step 6/9: Creating Systemd Service"

GETH_BIN=$(command -v geth)
GETH_ARGS=""

# Common args for all node types
GETH_ARGS+=" --datadir ${DATA_DIR}"
GETH_ARGS+=" --ipcpath ${DATA_DIR}/geth.ipc"
GETH_ARGS+=" --networkid ${NETWORK_ID}"
GETH_ARGS+=" --port ${P2P_PORT}"
GETH_ARGS+=" --metrics --metrics.addr 127.0.0.1 --metrics.port ${METRICS_PORT}"
GETH_ARGS+=" --verbosity 3"
GETH_ARGS+=" --log.file ${LOG_DIR}/node.log"

RPC_BIND_ADDR="127.0.0.1"
WS_BIND_ADDR="127.0.0.1"
HTTP_VHOSTS="localhost"
WS_ORIGINS="localhost"
if [ "${PUBLIC_RPC}" = "yes" ]; then
  RPC_BIND_ADDR="0.0.0.0"
  WS_BIND_ADDR="0.0.0.0"
  HTTP_VHOSTS="*"
  WS_ORIGINS="*"
fi

case "$NODE_TYPE" in
  main)
    # Keep authority/admin RPC local; public wallets use a dedicated RPC node.
    GETH_ARGS+=" --http --http.addr 127.0.0.1 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool,debug,clique,admin"
    GETH_ARGS+=" --http.vhosts localhost"
    GETH_ARGS+=" --ws --ws.addr 127.0.0.1 --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3,txpool"
    GETH_ARGS+=" --ws.origins *"
    GETH_ARGS+=" --mine --miner.etherbase ${MAIN_ACCOUNT}"
    GETH_ARGS+=" --unlock ${MAIN_ACCOUNT}"
    GETH_ARGS+=" --password ${CONFIG_DIR}/account-password.txt"
    GETH_ARGS+=" --allow-insecure-unlock"
    GETH_ARGS+=" --maxpeers 100"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    GETH_ARGS+=" --syncmode full"
    GETH_ARGS+=" --gcmode archive"
    ;;

  full)
    GETH_ARGS+=" --http --http.addr ${RPC_BIND_ADDR} --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool"
    GETH_ARGS+=" --http.vhosts ${HTTP_VHOSTS}"
    GETH_ARGS+=" --ws --ws.addr ${WS_BIND_ADDR} --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3,txpool"
    GETH_ARGS+=" --ws.origins ${WS_ORIGINS}"
    GETH_ARGS+=" --syncmode full"
    GETH_ARGS+=" --gcmode full"
    GETH_ARGS+=" --maxpeers 50"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    if [ -n "$MAIN_NODE_ENODE" ]; then
      GETH_ARGS+=" --bootnodes ${MAIN_NODE_ENODE}"
    fi
    ;;

  rpc|boost)
    GETH_ARGS+=" --http --http.addr ${RPC_BIND_ADDR} --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool"
    GETH_ARGS+=" --http.vhosts ${HTTP_VHOSTS}"
    GETH_ARGS+=" --ws --ws.addr ${WS_BIND_ADDR} --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3,txpool"
    GETH_ARGS+=" --ws.origins ${WS_ORIGINS}"
    GETH_ARGS+=" --syncmode full"
    GETH_ARGS+=" --gcmode archive"
    GETH_ARGS+=" --maxpeers 50"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    if [ -n "$MAIN_NODE_ENODE" ]; then
      GETH_ARGS+=" --bootnodes ${MAIN_NODE_ENODE}"
    fi
    ;;

  lite)
    GETH_ARGS+=" --http --http.addr ${RPC_BIND_ADDR} --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3"
    GETH_ARGS+=" --http.vhosts ${HTTP_VHOSTS}"
    GETH_ARGS+=" --ws --ws.addr ${WS_BIND_ADDR} --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3"
    GETH_ARGS+=" --ws.origins ${WS_ORIGINS}"
    GETH_ARGS+=" --syncmode light"
    GETH_ARGS+=" --maxpeers 25"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    if [ -n "$MAIN_NODE_ENODE" ]; then
      GETH_ARGS+=" --bootnodes ${MAIN_NODE_ENODE}"
    fi
    ;;

  validator)
    GETH_ARGS+=" --http --http.addr 127.0.0.1 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool,clique"
    GETH_ARGS+=" --http.corsdomain localhost"
    GETH_ARGS+=" --http.vhosts localhost"
    GETH_ARGS+=" --syncmode full"
    GETH_ARGS+=" --gcmode archive"
    GETH_ARGS+=" --maxpeers 50"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    GETH_ARGS+=" --mine"
    GETH_ARGS+=" --miner.etherbase ${VALIDATOR_ADDRESS}"
    GETH_ARGS+=" --unlock ${VALIDATOR_ADDRESS}"
    GETH_ARGS+=" --password ${CONFIG_DIR}/validator-password.txt"
    GETH_ARGS+=" --allow-insecure-unlock"
    if [ -n "$MAIN_NODE_ENODE" ]; then
      GETH_ARGS+=" --bootnodes ${MAIN_NODE_ENODE}"
    fi
    ;;
esac

# Write static-nodes.json for full/validator nodes
if { [ "$NODE_TYPE" = "full" ] || [ "$NODE_TYPE" = "rpc" ] || [ "$NODE_TYPE" = "boost" ] || [ "$NODE_TYPE" = "validator" ]; } && [ -n "$MAIN_NODE_ENODE" ]; then
  mkdir -p "${DATA_DIR}/geth"
  cat > "${DATA_DIR}/geth/static-nodes.json" <<STATIC
[
  "${MAIN_NODE_ENODE}"
]
STATIC
  log "static-nodes.json configured with MAIN node peer."
fi

# Write an empty static-nodes.json for lite nodes (user fills in full node enodes)
if [ "$NODE_TYPE" = "lite" ]; then
  mkdir -p "${DATA_DIR}/geth"
  if [ ! -f "${DATA_DIR}/geth/static-nodes.json" ]; then
    echo "[]" > "${DATA_DIR}/geth/static-nodes.json"
    warn "Add full node enode URLs to ${DATA_DIR}/geth/static-nodes.json before starting."
  fi
fi

# Create the systemd service unit
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SERVICE
[Unit]
Description=${NATIVE_COIN_NAME} ${NETWORK_ENV^^} ${NODE_TYPE^^} Node (${NODE_NAME})
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=gyds
Group=gyds
EnvironmentFile=${CONFIG_DIR}/node.env
ExecStart=${GETH_BIN}${GETH_ARGS}
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

if [ "$NETWORK_ENV" = "testnet" ] && [ "$NODE_TYPE" = "main" ] && [ "$TESTNET_AUTO_RESET" = "yes" ]; then
  cat > /usr/local/sbin/gyds-testnet-reset <<'RESET_SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE="/etc/gyds-testnet/node.env"
REQUEST_FILE="/var/lib/gyds-testnet/testnet-reset.request"
PROCESSING_FILE="${REQUEST_FILE}.processing"
FAILED_FILE="${REQUEST_FILE}.failed"
LOCK_FILE="/var/lib/gyds-testnet/testnet-reset.lock"
SERVICE="gyds-node-testnet.service"

[[ -f "$CONFIG_FILE" ]] || { echo "Missing Testnet node configuration." >&2; exit 1; }
# This file is generated by the root-only node installer.
source "$CONFIG_FILE"
[[ "${NETWORK_ENV:-}" = "testnet" ]] || { echo "Refusing reset: NETWORK_ENV is not testnet." >&2; exit 1; }
[[ "${CHAIN_ID:-}" = "198281" ]] || { echo "Refusing reset: chain ID is not 198281." >&2; exit 1; }
[[ "${NODE_TYPE:-}" = "main" ]] || { echo "Refusing reset: node role is not main." >&2; exit 1; }
[[ "${TESTNET_AUTO_RESET:-}" = "yes" ]] || { echo "Refusing reset: Testnet auto-reset is not enabled." >&2; exit 1; }
[[ "${DATA_DIR:-}" = "/var/lib/gyds-testnet" ]] || { echo "Refusing reset: unexpected Testnet data directory." >&2; exit 1; }
[[ "${CONFIG_DIR:-}" = "/etc/gyds-testnet" ]] || { echo "Refusing reset: unexpected Testnet config directory." >&2; exit 1; }
[[ -x "${GETH_BIN:-}" && -f "${CONFIG_DIR}/genesis.json" ]] || { echo "Missing Geth or Testnet genesis file." >&2; exit 1; }
[[ ! -L "$DATA_DIR" && ! -L "${DATA_DIR}/geth" && ! -L "${DATA_DIR}/geth/chaindata" ]] || { echo "Refusing reset: Testnet data path contains a symlink." >&2; exit 1; }
jq -e '.config.chainId == 198281' "${CONFIG_DIR}/genesis.json" >/dev/null || { echo "Refusing reset: Testnet genesis has the wrong chain ID." >&2; exit 1; }
systemctl cat "$SERVICE" | grep -Fq -- "--datadir /var/lib/gyds-testnet" || { echo "Refusing reset: Testnet service does not use its isolated data directory." >&2; exit 1; }
systemctl cat "$SERVICE" | grep -Fq -- "--http.port 9545" || { echo "Refusing reset: Testnet service does not use RPC port 9545." >&2; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0
if [[ -f "$REQUEST_FILE" ]]; then
  [[ ! -e "$PROCESSING_FILE" && ! -e "$FAILED_FILE" ]] || exit 0
  mv "$REQUEST_FILE" "$PROCESSING_FILE"
elif [[ ! -f "$PROCESSING_FILE" || -e "$FAILED_FILE" ]]; then
  exit 0
fi

reset_failed() {
  local status=$?
  systemctl start "$SERVICE" >/dev/null 2>&1 || true
  mv -f "$PROCESSING_FILE" "$FAILED_FILE" 2>/dev/null || true
  logger -t gyds-testnet-reset "Testnet reset failed (exit ${status}); operator review required."
  exit "$status"
}
trap reset_failed ERR

systemctl stop "$SERVICE"
rm -rf -- "${DATA_DIR}/geth/chaindata"
"${GETH_BIN}" init --datadir "$DATA_DIR" "${CONFIG_DIR}/genesis.json"
chown -R gyds:gyds "$DATA_DIR"
systemctl start "$SERVICE"
rm -f "$PROCESSING_FILE" "$FAILED_FILE"
trap - ERR
logger -t gyds-testnet-reset "Testnet chain reset to genesis; TGYD must be redeployed by the admin wallet."
RESET_SCRIPT
  chmod 750 /usr/local/sbin/gyds-testnet-reset
  chown root:root /usr/local/sbin/gyds-testnet-reset

  cat > /etc/systemd/system/gyds-node-testnet-reset.service <<'RESET_SERVICE'
[Unit]
Description=Reset exhausted GYDS Testnet chain
After=network.target
ConditionPathExists=/run/gyds-testnet-reset.request

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/gyds-testnet-reset
RESET_SERVICE

  cat > /etc/systemd/system/gyds-node-testnet-reset.path <<'RESET_PATH'
[Unit]
Description=Watch for an approved GYDS Testnet faucet reset

[Path]
PathExists=/var/lib/gyds-testnet/testnet-reset.request
PathExists=/var/lib/gyds-testnet/testnet-reset.request.processing
Unit=gyds-node-testnet-reset.service

[Install]
WantedBy=multi-user.target
RESET_PATH

  printf 'enabled\n' > "${CONFIG_DIR}/auto-reset-enabled"
  chmod 644 "${CONFIG_DIR}/auto-reset-enabled"
  systemctl daemon-reload
  systemctl enable --now gyds-node-testnet-reset.path
  log "Testnet-only auto-reset watcher enabled; Mainnet state is untouched and TGYD requires admin redeployment."
fi

# Ensure data and log dirs are owned by the gyds user the service runs as
chown -R gyds:gyds "${DATA_DIR}" "${LOG_DIR}"

systemctl daemon-reload
log "Systemd service created: /etc/systemd/system/${SERVICE_NAME}.service"

# ============================================================
# STEP 7: Configure Firewall
# ============================================================
header "Step 7/9: Configuring Firewall"

ufw default deny incoming 2>/dev/null || true
ufw default allow outgoing 2>/dev/null || true
ufw allow ssh 2>/dev/null || true
ufw allow "${P2P_PORT}/tcp" 2>/dev/null || true
ufw allow "${P2P_PORT}/udp" 2>/dev/null || true

if [ "$NODE_TYPE" = "validator" ]; then
  info "Validator: only P2P (${P2P_PORT}) opened. RPC stays on localhost."
elif [ "${PUBLIC_RPC,,}" = "yes" ]; then
  ufw allow "${RPC_PORT}/tcp" 2>/dev/null || true
  ufw allow "${WS_PORT}/tcp" 2>/dev/null || true
  warn "PUBLIC_RPC=yes — RPC (${RPC_PORT}) and WS (${WS_PORT}) are open to the internet."
  warn "Put Nginx (rate limiting + TLS + method allow-list) in front of this node."
else
  ufw deny "${RPC_PORT}/tcp" 2>/dev/null || true
  ufw deny "${WS_PORT}/tcp" 2>/dev/null || true
  info "RPC/WS restricted to localhost and the VPN. Set PUBLIC_RPC=yes to expose them."
fi

ufw --force enable 2>/dev/null || warn "UFW not available or already enabled. Configure firewall manually if needed."
log "Firewall configured."

# ============================================================
# STEP 7b: Hardening — time sync, keystore, log rotation
# ============================================================
header "Step 7b/9: Hardening"

# --- Time sync (clock drift breaks PoS/clique block timing) ---
systemctl enable --now chrony 2>/dev/null || systemctl enable --now chronyd 2>/dev/null || \
  warn "chrony not available — install an NTP client manually."
timedatectl set-ntp true 2>/dev/null || true
log "Time synchronisation enabled."

# --- Keystore & secret permissions ---
if [ -d "${DATA_DIR}/keystore" ]; then
  chmod 700 "${DATA_DIR}/keystore"
  find "${DATA_DIR}/keystore" -type f -exec chmod 600 {} \;
fi
chmod 700 "${CONFIG_DIR}" 2>/dev/null || true
for SECRET in "${CONFIG_DIR}"/*password*.txt; do
  [ -f "$SECRET" ] && chmod 600 "$SECRET"
done
log "Keystore and password files locked down (700/600)."

# --- Log rotation ---
cat > "/etc/logrotate.d/${SERVICE_NAME}" <<LOGROTATE
${LOG_DIR}/*.log {
  daily
  rotate 14
  size 100M
  missingok
  notifempty
  compress
  delaycompress
  copytruncate
}
LOGROTATE
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/gyds.conf <<JOURNALD
[Journal]
SystemMaxUse=1G
MaxRetentionSec=1month
JOURNALD
systemctl restart systemd-journald 2>/dev/null || true
log "Log rotation configured (logrotate + journald caps)."

# ============================================================
# STEP 7c: Backups, health monitor, upgrade/rollback
# ============================================================
header "Step 7c/9: Backups & Monitoring"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

cat > "/usr/local/bin/${TOOL_PREFIX}-backup" <<'MGMT'
#!/bin/bash
# Snapshot chain data, genesis, keystore and node.env.
set -euo pipefail
source /etc/gyds/node.env
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gyds}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/gyds-${NODE_TYPE}-${STAMP}.tar.gz"
mkdir -p "$BACKUP_DIR"

WAS_RUNNING=no
if systemctl is-active --quiet gyds-node; then WAS_RUNNING=yes; systemctl stop gyds-node; fi
trap '[ "$WAS_RUNNING" = yes ] && systemctl start gyds-node || true' EXIT

tar -czf "$OUT" \
  -C / \
  "${DATA_DIR#/}" \
  "${CONFIG_DIR#/}" 2>/dev/null
chmod 600 "$OUT"
sha256sum "$OUT" > "${OUT}.sha256"
echo "Backup written: $OUT"

# Retention
ls -1t "${BACKUP_DIR}"/gyds-*.tar.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | while read -r OLD; do
  rm -f "$OLD" "${OLD}.sha256"
  echo "Removed old backup: $OLD"
done
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-restore" <<'MGMT'
#!/bin/bash
# Usage: gyds-restore /var/backups/gyds/gyds-main-YYYYmmdd-HHMMSS.tar.gz
set -euo pipefail
ARCHIVE="${1:-}"
[ -f "$ARCHIVE" ] || { echo "Usage: gyds-restore <backup.tar.gz>"; exit 1; }
if [ -f "${ARCHIVE}.sha256" ]; then
  sha256sum -c "${ARCHIVE}.sha256" || { echo "Checksum mismatch — refusing to restore."; exit 1; }
fi
source /etc/gyds/node.env 2>/dev/null || true
read -r -p "This overwrites ${DATA_DIR:-/var/lib/gyds} and ${CONFIG_DIR:-/etc/gyds}. Continue? [y/N] " OK
[ "${OK,,}" = "y" ] || exit 1
systemctl stop gyds-node || true
tar -xzf "$ARCHIVE" -C /
systemctl start gyds-node
echo "Restore complete. Verify with: gyds-health"
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-health" <<'MGMT'
#!/bin/bash
# Peer-count and block-stall health check. Restarts a stuck node.
set -uo pipefail
source /etc/gyds/node.env
RPC="http://127.0.0.1:${RPC_PORT}"
MIN_PEERS="${HEALTH_MIN_PEERS:-1}"
STALL="${HEALTH_STALL_SECONDS:-300}"
STATE_FILE="/var/lib/gyds/.health-state"
RESTART="${1:-}"

rpc() { curl -fsS --max-time 8 "$RPC" -H 'content-type: application/json' \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":${2:-[]},\"id\":1}"; }

if ! systemctl is-active --quiet gyds-node; then
  echo "CRITICAL: gyds-node is not running."
  [ "$RESTART" = "--auto-restart" ] && systemctl restart gyds-node
  exit 2
fi

BLOCK_HEX="$(rpc eth_blockNumber | jq -r '.result // empty')"
PEERS_HEX="$(rpc net_peerCount | jq -r '.result // empty')"
SYNCING="$(rpc eth_syncing | jq -r '.result')"
[ -n "$BLOCK_HEX" ] || { echo "CRITICAL: RPC not answering."; [ "$RESTART" = "--auto-restart" ] && systemctl restart gyds-node; exit 2; }

BLOCK=$((16#${BLOCK_HEX#0x}))
PEERS=$((16#${PEERS_HEX#0x}))
NOW=$(date +%s)

LAST_BLOCK=0; LAST_TS=$NOW
[ -f "$STATE_FILE" ] && read -r LAST_BLOCK LAST_TS < "$STATE_FILE"

STATUS=OK
if [ "$BLOCK" -gt "$LAST_BLOCK" ]; then
  echo "$BLOCK $NOW" > "$STATE_FILE"
elif [ $((NOW - LAST_TS)) -ge "$STALL" ]; then
  STATUS=STALLED
fi

[ "$PEERS" -lt "$MIN_PEERS" ] && STATUS="${STATUS}/LOW_PEERS"

echo "block=${BLOCK} peers=${PEERS} syncing=${SYNCING} status=${STATUS}"

if [ "$STATUS" != "OK" ] && [ "$RESTART" = "--auto-restart" ]; then
  logger -t gyds-health "Node unhealthy (${STATUS}) — restarting gyds-node"
  systemctl restart gyds-node
  echo "$BLOCK $NOW" > "$STATE_FILE"
  exit 1
fi
[ "$STATUS" = "OK" ] || exit 1
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-upgrade" <<'MGMT'
#!/bin/bash
# Versioned geth upgrade with automatic rollback.
# Usage: gyds-upgrade /path/to/new/geth   |   gyds-upgrade --rollback
set -euo pipefail
GETH_BIN="$(command -v geth)"
BACKUP="/var/backups/gyds/geth.previous"
mkdir -p /var/backups/gyds

if [ "${1:-}" = "--rollback" ]; then
  [ -f "$BACKUP" ] || { echo "No previous binary to roll back to."; exit 1; }
  systemctl stop gyds-node
  cp "$BACKUP" "$GETH_BIN"
  systemctl start gyds-node
  echo "Rolled back to previous geth build."
  exit 0
fi

NEW="${1:-}"
[ -x "$NEW" ] || { echo "Usage: gyds-upgrade /path/to/geth  (or --rollback)"; exit 1; }

gyds-backup || echo "Warning: pre-upgrade data backup failed."
cp "$GETH_BIN" "$BACKUP"
systemctl stop gyds-node
cp "$NEW" "$GETH_BIN"; chmod +x "$GETH_BIN"
systemctl start gyds-node
sleep 10

if gyds-health >/dev/null 2>&1; then
  echo "Upgrade OK: $(geth version | head -3 | tr '\n' ' ')"
else
  echo "Health check failed — rolling back."
  systemctl stop gyds-node
  cp "$BACKUP" "$GETH_BIN"
  systemctl start gyds-node
  exit 1
fi
MGMT

chmod +x "/usr/local/bin/${TOOL_PREFIX}-backup" "/usr/local/bin/${TOOL_PREFIX}-restore" \
         "/usr/local/bin/${TOOL_PREFIX}-health" "/usr/local/bin/${TOOL_PREFIX}-upgrade"

# --- Timers: nightly backup, health check every 2 minutes ---
cat > "/etc/systemd/system/${TOOL_PREFIX}-backup.service" <<'UNIT'
[Unit]
Description=GYDS chain data backup
[Service]
Type=oneshot
ExecStart=/usr/local/bin/gyds-backup
UNIT

cat > "/etc/systemd/system/${TOOL_PREFIX}-backup.timer" <<'UNIT'
[Unit]
Description=Nightly GYDS chain data backup
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT

cat > "/etc/systemd/system/${TOOL_PREFIX}-health.service" <<'UNIT'
[Unit]
Description=GYDS node health check
[Service]
Type=oneshot
ExecStart=/usr/local/bin/gyds-health --auto-restart
UNIT

cat > "/etc/systemd/system/${TOOL_PREFIX}-health.timer" <<'UNIT'
[Unit]
Description=Run GYDS node health check every 2 minutes
[Timer]
OnBootSec=3min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now "${TOOL_PREFIX}-backup.timer" "${TOOL_PREFIX}-health.timer" 2>/dev/null || \
  warn "Could not enable backup/health timers — enable them manually."
log "Backups (nightly), health monitor (2 min) and upgrade/rollback installed."

# ============================================================
# STEP 8: Install Management Commands
# ============================================================
header "Step 8/9: Creating Management Scripts"

cat > "/usr/local/bin/${TOOL_PREFIX}-start" <<'MGMT'
#!/bin/bash
systemctl start gyds-node
echo "GYDS node started."
systemctl status gyds-node --no-pager -l
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-stop" <<'MGMT'
#!/bin/bash
systemctl stop gyds-node
echo "GYDS node stopped."
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-restart" <<'MGMT'
#!/bin/bash
systemctl restart gyds-node
echo "GYDS node restarted."
systemctl status gyds-node --no-pager -l
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-status" <<'MGMT'
#!/bin/bash
echo "=== GYDS Node Status ==="
systemctl status gyds-node --no-pager -l
echo ""
echo "=== Logs (last 20 lines) ==="
tail -20 /var/log/gyds/node.log 2>/dev/null || echo "No logs yet."
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-logs" <<'MGMT'
#!/bin/bash
tail -f /var/log/gyds/node.log
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-console" <<'MGMT'
#!/bin/bash
source /etc/gyds/node.env
geth attach "${DATA_DIR}/geth.ipc"
MGMT

install -o root -g root -m 0755 \
  "${SCRIPT_DIR}/scripts/gyds-enode" \
  "/usr/local/bin/${TOOL_PREFIX}-enode"

cat > "/usr/local/bin/${TOOL_PREFIX}-peers" <<'MGMT'
#!/bin/bash
source /etc/gyds/node.env
geth attach --exec "admin.peers.length" "${DATA_DIR}/geth.ipc" 2>/dev/null \
  || echo "Node not running or RPC not available."
MGMT

cat > "/usr/local/bin/${TOOL_PREFIX}-admin-check" <<'MGMT'
#!/usr/bin/env bash
set -euo pipefail

source /etc/gyds/node.env
IPC_PATH="${DATA_DIR:-/var/lib/gyds}/geth.ipc"

[ -S "${IPC_PATH}" ] || {
  echo "ERROR: Geth IPC socket not found: ${IPC_PATH}" >&2
  echo "Check: sudo systemctl status gyds-node" >&2
  exit 1
}

ADMIN_TYPE="$(geth attach --exec 'typeof admin' "${IPC_PATH}" 2>/dev/null | tr -d '\r')"
[ "${ADMIN_TYPE}" = "object" ] || {
  echo "ERROR: admin namespace is unavailable over the local IPC socket (got: ${ADMIN_TYPE:-empty})" >&2
  exit 1
}

ENODE="$(geth attach --exec 'admin.nodeInfo.enode' "${IPC_PATH}" 2>/dev/null | tr -d '\r')"
[ -n "${ENODE}" ] || {
  echo "ERROR: admin.nodeInfo.enode returned no value." >&2
  exit 1
}

PEERS="$(geth attach --exec 'admin.peers.length' "${IPC_PATH}" 2>/dev/null | tr -d '\r')"

echo "admin namespace: available over IPC"
echo "IPC socket:      ${IPC_PATH}"
echo "enode:           ${ENODE}"
echo "peer count:      ${PEERS:-unknown}"
MGMT

# Add / remove bootnode enodes in static-nodes.json at runtime
cat > "/usr/local/bin/${TOOL_PREFIX}-add-bootnode" <<'MGMT'
#!/bin/bash
# Usage: gyds-add-bootnode "enode://PUBKEY@IP:30303"
#        gyds-add-bootnode --list
#        gyds-add-bootnode --clear

source /etc/gyds/node.env 2>/dev/null || true
STATIC_NODES="${DATA_DIR:-/var/lib/gyds}/geth/static-nodes.json"

if [ "$1" = "--list" ]; then
  echo "=== Current static-nodes.json ==="
  cat "$STATIC_NODES" 2>/dev/null || echo "(file not found)"
  exit 0
fi

if [ "$1" = "--clear" ]; then
  echo "[]" > "$STATIC_NODES"
  echo "Cleared all static nodes."
  echo "Restart the node for changes to take effect: gyds-restart"
  exit 0
fi

ENODE="$1"
if [ -z "$ENODE" ]; then
  echo "Usage: gyds-add-bootnode \"enode://PUBKEY@IP:30303\""
  echo "       gyds-add-bootnode --list"
  echo "       gyds-add-bootnode --clear"
  exit 1
fi

if [[ ! "$ENODE" =~ ^enode:// ]]; then
  echo "Error: enode must start with 'enode://'"
  exit 1
fi

mkdir -p "$(dirname "$STATIC_NODES")"

# Read existing file or start with empty array
if [ -f "$STATIC_NODES" ] && [ -s "$STATIC_NODES" ]; then
  EXISTING=$(cat "$STATIC_NODES")
else
  EXISTING="[]"
fi

# Check if already present
if echo "$EXISTING" | grep -qF "$ENODE"; then
  echo "Enode already in static-nodes.json — no change."
  exit 0
fi

# Append the new enode (simple JSON manipulation without jq dependency)
if [ "$EXISTING" = "[]" ]; then
  NEW="[\n  \"${ENODE}\"\n]"
else
  # Insert before the closing ]
  NEW=$(echo "$EXISTING" | sed "s|]$|,\n  \"${ENODE}\"\n]|")
fi

printf "%b" "$NEW" > "$STATIC_NODES"
echo "Added bootnode: ${ENODE}"
echo ""
echo "Restart the node for changes to take effect:"
echo "  gyds-restart"
echo ""
echo "Verify peers after restart:"
echo "  gyds-peers"
MGMT

# Update also writes to BOOTNODE_ENODE in the env file and geth static-nodes
cat > "/usr/local/bin/${TOOL_PREFIX}-set-bootnode" <<'MGMT'
#!/bin/bash
# Usage: gyds-set-bootnode "enode://PUBKEY@IP:30303"
# Sets the bootnode in both static-nodes.json AND /etc/gyds/node.env

ENODE="$1"
if [ -z "$ENODE" ]; then
  echo "Usage: gyds-set-bootnode \"enode://PUBKEY@IP:30303\""
  exit 1
fi

gyds-add-bootnode "$ENODE" || exit 1

# Update node.env
if grep -q "MAIN_NODE_ENODE=" /etc/gyds/node.env 2>/dev/null; then
  sed -i "s|^MAIN_NODE_ENODE=.*|MAIN_NODE_ENODE=${ENODE}|" /etc/gyds/node.env
else
  echo "MAIN_NODE_ENODE=${ENODE}" >> /etc/gyds/node.env
fi
echo "Updated /etc/gyds/node.env with new bootnode enode."
MGMT

if [ -f "${SCRIPT_DIR}/scripts/gyds-enode" ]; then
  install -m 0755 "${SCRIPT_DIR}/scripts/gyds-enode" "/usr/local/bin/${TOOL_PREFIX}-enode"
fi

if [ "$NETWORK_ENV" = "testnet" ]; then
  for INSTANCE_FILE in /usr/local/bin/${TOOL_PREFIX}-* /etc/systemd/system/${TOOL_PREFIX}-*; do
    [ -f "$INSTANCE_FILE" ] || continue
    sed -i -E \
      -e "s#/etc/gyds/#${CONFIG_DIR}/#g" \
      -e "s#/var/lib/gyds#${DATA_DIR}#g" \
      -e "s#/var/log/gyds#${LOG_DIR}#g" \
      -e "s#/var/backups/gyds#${BACKUP_DIR}#g" \
      -e "s#\\bgyds-node\\b#${SERVICE_NAME}#g" \
      -e "s#\\bgyds-(backup|restore|health|upgrade|start|stop|restart|status|logs|console|enode|peers|admin-check|add-bootnode|set-bootnode)\\b#${TOOL_PREFIX}-\\1#g" \
      "$INSTANCE_FILE"
  done
fi

chmod +x "/usr/local/bin/${TOOL_PREFIX}-"{start,stop,restart,status,logs,console,enode,peers,admin-check,add-bootnode,set-bootnode}
log "Management commands installed with prefix ${TOOL_PREFIX}-."

# ============================================================
# STEP 9: Enable & Start the Node
# ============================================================
header "Step 9/9: Starting Node"

systemctl enable "${SERVICE_NAME}.service"
systemctl restart "${SERVICE_NAME}.service"

for ATTEMPT in $(seq 1 10); do
  systemctl is-active --quiet "${SERVICE_NAME}.service" && break
  sleep 1
done

if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  log "${NATIVE_COIN_NAME} ${NODE_TYPE^^} node is running!"
else
  warn "${NATIVE_COIN_NAME} ${NODE_TYPE^^} node failed to start. Recent service output:"
  systemctl --no-pager --full status "${SERVICE_NAME}.service" || true
  journalctl -u "${SERVICE_NAME}.service" -n 50 --no-pager || true
  err "Node setup did not complete because ${SERVICE_NAME} is not active."
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
printf "║   ✅ GYDS %-10s Node Installed!%-19s║\n" "${NODE_TYPE^^}" ""
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
printf "║   Name:    %-45s║\n" "${NODE_NAME}"
printf "║   Type:    %-45s║\n" "${NODE_TYPE^^}"
printf "║   IP:      %-45s║\n" "${SERVER_IP}"
printf "║   Data:    %-45s║\n" "${DATA_DIR}"
echo "║                                                          ║"
echo "║   Ports:                                                 ║"
printf "║     P2P (TCP+UDP): %-38s║\n" "${P2P_PORT}"
printf "║     RPC (HTTP):    %-38s║\n" "${RPC_PORT}"
printf "║     WS:            %-38s║\n" "${WS_PORT}"
printf "║     Metrics:       %-38s║\n" "${METRICS_PORT}"
echo "║                                                          ║"

case "$NODE_TYPE" in
  main)
    echo "║   ⚠ IMPORTANT: This is the MAIN (authority) node!       ║"
    echo "║                                                          ║"
    echo "║   Share with other nodes:                                ║"
    echo "║     Enode URL: gyds-enode                                ║"
    printf "║     Genesis:   %-42s║\n" "${CONFIG_DIR}/genesis.json"
    echo "║                                                          ║"
    printf "║   Main account:   %-39s║\n" "${MAIN_ACCOUNT}"
    printf "║   Account key:    %-39s║\n" "${CONFIG_DIR}/account-password.txt"
    echo "║                                                          ║"
    printf "║   Admin wallet:   %-39s║\n" "${ADMIN_WALLET}"
    printf "║   Admin label:    %-39s║\n" "${ADMIN_WALLET_LABEL}"
    if [ "$ADMIN_WALLET_CREATED" = "yes" ]; then
      printf "║   Admin key pass: %-39s║\n" "${CONFIG_DIR}/admin-password.txt"
      printf "║   Admin keystore: %-39s║\n" "${DATA_DIR}/keystore"
    fi
    ;;
  full)
    printf "║   Syncing from MAIN: %-37s║\n" "${MAIN_NODE_IP}"
    echo "║   Once synced, share your enode with lite nodes.         ║"
    echo "║     gyds-enode                                           ║"
    ;;
  rpc|boost)
    printf "║   Syncing from MAIN: %-37s║\n" "${MAIN_NODE_IP}"
    echo "║   Public RPC endpoint for wallets/websites.              ║"
    printf "║     HTTP RPC: %-43s║\n" "http://${SERVER_IP}:${RPC_PORT}"
    printf "║     WS RPC:   %-43s║\n" "ws://${SERVER_IP}:${WS_PORT}"
    ;;
  lite)
    printf "║   Syncing from FULL nodes: %-31s║\n" "${FULL_NODE_IPS}"
    echo "║                                                          ║"
    echo "║   Wallets & websites connect to:                         ║"
    printf "║     HTTP RPC: %-43s║\n" "http://${SERVER_IP}:${RPC_PORT}"
    printf "║     WS RPC:   %-43s║\n" "ws://${SERVER_IP}:${WS_PORT}"
    echo "║                                                          ║"
    echo "║   Configure this node on the API server:                 ║"
    echo "║     Admin → Nodes or GYDS_REMOTE_RPC_URL                 ║"
    ;;
  validator)
    printf "║   Validator:  %-43s║\n" "${VALIDATOR_ADDRESS}"
    printf "║   MAIN node:  %-43s║\n" "${MAIN_NODE_IP}"
    echo "║   Consensus:  Clique proof-of-authority (not PoS staking) ║"
    echo "║   Ask the MAIN node admin to authorize you:              ║"
    printf "║     clique.propose(\"%s\", true)%-18s║\n" "${VALIDATOR_ADDRESS}" ""
    ;;
esac

echo "║                                                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Management Commands:                                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║   %-14s — Start the node                         ║\n" "${TOOL_PREFIX}-start"
printf "║   %-14s — Stop the node                          ║\n" "${TOOL_PREFIX}-stop"
printf "║   %-14s — Restart the node                       ║\n" "${TOOL_PREFIX}-restart"
printf "║   %-14s — View status & recent logs              ║\n" "${TOOL_PREFIX}-status"
printf "║   %-14s — Follow live logs                       ║\n" "${TOOL_PREFIX}-logs"
printf "║   %-14s — Attach geth JS console                 ║\n" "${TOOL_PREFIX}-console"
printf "║   %-14s — Show this node's enode URL             ║\n" "${TOOL_PREFIX}-enode"
printf "║   %-14s — Show connected peer count              ║\n" "${TOOL_PREFIX}-peers"
echo "╚══════════════════════════════════════════════════════════╝"

echo ""
echo "📋 NEXT STEPS for ${NODE_TYPE^^} node:"
case "$NODE_TYPE" in
  main)
    echo "  1. Check it's running:      gyds-logs"
    echo "  2. Get your enode URL:      gyds-enode"
    echo "  3. Copy genesis.json + enode to other nodes"
    echo "  4. Configure the API server to reach this node in Admin → Nodes"
    echo "     or set GYDS_REMOTE_RPC_URL in the API server's .env"
    ;;
  full)
    echo "  1. Verify genesis.json matches the MAIN node"
    echo "  2. Wait for sync:           gyds-console → eth.syncing"
    echo "  3. Get enode for lite nodes: gyds-enode"
    ;;
  rpc)
    echo "  1. Verify genesis.json matches the MAIN node"
    echo "  2. Wait for sync:           gyds-console → eth.syncing"
    printf "  3. Point wallets/websites to: http://%s:%s\n" "${SERVER_IP}" "${RPC_PORT}"
    echo "  4. Add this RPC in the API server's Admin → Nodes"
    echo "     or set GYDS_REMOTE_RPC_URL in the API server's .env"
    ;;
  boost)
    echo "  1. Verify genesis.json matches the MAIN node"
    echo "  2. Wait for sync:           gyds-console → eth.syncing"
    printf "  3. Point wallets/websites to: http://%s:%s\n" "${SERVER_IP}" "${RPC_PORT}"
    echo "  4. Add this RPC in the API server's Admin → Nodes"
    echo "     or set GYDS_REMOTE_RPC_URL_2 in the API server's .env"
    ;;
  lite)
    printf "  1. Add full node enodes to %s/geth/static-nodes.json\n" "${DATA_DIR}"
    echo "  2. Restart:                 gyds-restart"
    printf "  3. Point wallets to:        http://%s:%s\n" "${SERVER_IP}" "${RPC_PORT}"
    echo "  4. Add this RPC in the API server's Admin → Nodes"
    echo "     or set GYDS_REMOTE_RPC_URL in the API server's .env"
    ;;
  validator)
    echo "  1. Ask the MAIN node admin to run:"
    printf "       clique.propose(\"%s\", true)\n" "${VALIDATOR_ADDRESS}"
    echo "  2. Wait for sync, then authority sealing begins automatically"
    echo "  3. Confirm authorization on MAIN: clique.getSigners()"
    echo "  4. Monitor:                 gyds-logs"
    echo "  Note: this chain uses Clique authority, not proof-of-stake staking."
    ;;
esac

echo ""
log "Node setup complete!"
