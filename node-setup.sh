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
#   - Full nodes that also participate in consensus
#   - Sync from MAIN node, submit sealed blocks
#
# Usage:
#   chmod +x node-setup.sh
#   sudo ./node-setup.sh
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
GETH_VERSION="1.13.15-c2ad2fa2"
DATA_DIR="/var/lib/gyds"
CONFIG_DIR="/etc/gyds"
LOG_DIR="/var/log/gyds"
CHAIN_ID=29987
NETWORK_ID=29987
NODE_NAME="gyds-node"

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
echo "║   4) VALIDATOR — Full node + consensus         ║"
echo "║                  (syncs from Main, seals)      ║"
echo "║                                                ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
read -p "Enter choice [1-4]: " NODE_TYPE_CHOICE

case "$NODE_TYPE_CHOICE" in
  1) NODE_TYPE="main" ;;
  2) NODE_TYPE="full" ;;
  3) NODE_TYPE="lite" ;;
  4) NODE_TYPE="validator" ;;
  *) err "Invalid choice. Please enter 1, 2, 3, or 4." ;;
esac

NODE_NAME="gyds-${NODE_TYPE}"

# ---------- Collect Info Based on Node Type ----------
header "Configuration for ${NODE_TYPE^^} node"

read -p "Enter a friendly name for this node [${NODE_NAME}]: " CUSTOM_NAME
NODE_NAME="${CUSTOM_NAME:-$NODE_NAME}"

if [ "$NODE_TYPE" != "main" ]; then
  echo ""
  if [ "$NODE_TYPE" = "full" ] || [ "$NODE_TYPE" = "validator" ]; then
    info "Full/Validator nodes sync from the MAIN node."
    read -p "Enter MAIN node IP address: " MAIN_NODE_IP
    [ -z "$MAIN_NODE_IP" ] && err "Main node IP is required for ${NODE_TYPE} nodes."
    read -p "Enter MAIN node enode URL (or press Enter to skip): " MAIN_NODE_ENODE
  elif [ "$NODE_TYPE" = "lite" ]; then
    info "Lite nodes sync from FULL nodes."
    read -p "Enter FULL node IP address(es) (comma-separated for multiple): " FULL_NODE_IPS
    [ -z "$FULL_NODE_IPS" ] && err "At least one Full node IP is required for lite nodes."
  fi
fi

if [ "$NODE_TYPE" = "validator" ]; then
  echo ""
  info "Validator nodes need a signing account."
  read -p "Enter validator account address (0x...): " VALIDATOR_ADDRESS
  [ -z "$VALIDATOR_ADDRESS" ] && err "Validator account address is required."
  read -s -p "Enter validator account password: " VALIDATOR_PASSWORD
  echo ""
  [ -z "$VALIDATOR_PASSWORD" ] && err "Validator account password is required."
fi

# ============================================================
# STEP 1: System Dependencies
# ============================================================
header "Step 1/9: Installing System Dependencies"

apt-get update -y
apt-get install -y curl wget git build-essential software-properties-common \
  apt-transport-https ca-certificates openssl ufw jq

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
  rm -rf geth.tar.gz "geth-linux-${GETH_ARCH}-${GETH_VERSION}"
  cd - >/dev/null
}

if command -v geth &>/dev/null; then
  warn "Geth already installed: $(geth version 2>/dev/null | head -1)"
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

if command -v geth &>/dev/null; then
  log "Geth installed: $(geth version 2>/dev/null | head -1)"
else
  err "Geth could not be installed. Please install it manually from https://geth.ethereum.org/downloads and re-run this script."
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
      "balance": "1000000000000000000000000000"
    }
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
      warn "Creating a placeholder genesis.json."
      warn "⚠ You MUST replace ${CONFIG_DIR}/genesis.json with the real file from the MAIN node before syncing."
      cat > "${CONFIG_DIR}/genesis.json" <<'PLACEHOLDER'
{
  "config": {
    "chainId": 29987,
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
  "extradata": "0x",
  "alloc": {}
}
PLACEHOLDER
    fi

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
CHAIN_ID=${CHAIN_ID}
NETWORK_ID=${NETWORK_ID}

# ---------- Directories ----------
DATA_DIR=${DATA_DIR}
CONFIG_DIR=${CONFIG_DIR}
LOG_DIR=${LOG_DIR}

# ---------- Ports ----------
RPC_PORT=${RPC_PORT}
WS_PORT=${WS_PORT}
P2P_PORT=${P2P_PORT}
METRICS_PORT=${METRICS_PORT}

# ---------- Peer Configuration ----------
MAIN_NODE_IP=${MAIN_NODE_IP}
MAIN_NODE_ENODE=${MAIN_NODE_ENODE}
FULL_NODE_IPS=${FULL_NODE_IPS}

# ---------- Validator Settings ----------
VALIDATOR_ADDRESS=${VALIDATOR_ADDRESS}

# ---------- Performance ----------
CACHE_SIZE=1024
MAX_PEERS=50
NODEENV

chmod 600 "${CONFIG_DIR}/node.env"

# Write validator password file if applicable
if [ "$NODE_TYPE" = "validator" ] && [ -n "$VALIDATOR_PASSWORD" ]; then
  echo "${VALIDATOR_PASSWORD}" > "${CONFIG_DIR}/validator-password.txt"
  chmod 600 "${CONFIG_DIR}/validator-password.txt"
fi

log "Environment written to ${CONFIG_DIR}/node.env"

# ============================================================
# STEP 6: Build Geth Command & Create Systemd Service
# ============================================================
header "Step 6/9: Creating Systemd Service"

GETH_BIN=$(command -v geth)
GETH_ARGS=""

# Common args for all node types
GETH_ARGS+=" --datadir ${DATA_DIR}"
GETH_ARGS+=" --networkid ${NETWORK_ID}"
GETH_ARGS+=" --port ${P2P_PORT}"
GETH_ARGS+=" --metrics --metrics.addr 0.0.0.0 --metrics.port ${METRICS_PORT}"
GETH_ARGS+=" --verbosity 3"
GETH_ARGS+=" --log.file ${LOG_DIR}/node.log"

case "$NODE_TYPE" in
  main)
    GETH_ARGS+=" --http --http.addr 0.0.0.0 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool,debug,clique,admin"
    GETH_ARGS+=" --http.corsdomain *"
    GETH_ARGS+=" --http.vhosts *"
    GETH_ARGS+=" --ws --ws.addr 0.0.0.0 --ws.port ${WS_PORT}"
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
    GETH_ARGS+=" --http --http.addr 0.0.0.0 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool"
    GETH_ARGS+=" --http.corsdomain *"
    GETH_ARGS+=" --http.vhosts *"
    GETH_ARGS+=" --ws --ws.addr 0.0.0.0 --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3,txpool"
    GETH_ARGS+=" --ws.origins *"
    GETH_ARGS+=" --syncmode full"
    GETH_ARGS+=" --gcmode full"
    GETH_ARGS+=" --maxpeers 50"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    if [ -n "$MAIN_NODE_ENODE" ]; then
      GETH_ARGS+=" --bootnodes ${MAIN_NODE_ENODE}"
    fi
    ;;

  lite)
    GETH_ARGS+=" --http --http.addr 0.0.0.0 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3"
    GETH_ARGS+=" --http.corsdomain *"
    GETH_ARGS+=" --http.vhosts *"
    GETH_ARGS+=" --ws --ws.addr 0.0.0.0 --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3"
    GETH_ARGS+=" --ws.origins *"
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
if { [ "$NODE_TYPE" = "full" ] || [ "$NODE_TYPE" = "validator" ]; } && [ -n "$MAIN_NODE_ENODE" ]; then
  mkdir -p "${DATA_DIR}/geth"
  cat > "${DATA_DIR}/geth/static-nodes.json" <<STATIC
[
  "${MAIN_NODE_ENODE}"
]
STATIC
  log "static-nodes.json configured with MAIN node peer."
fi

# Write static-nodes.json placeholder for lite nodes (user fills in full node enodes)
if [ "$NODE_TYPE" = "lite" ]; then
  mkdir -p "${DATA_DIR}/geth"
  if [ ! -f "${DATA_DIR}/geth/static-nodes.json" ]; then
    echo "[]" > "${DATA_DIR}/geth/static-nodes.json"
    warn "Add full node enode URLs to ${DATA_DIR}/geth/static-nodes.json before starting."
  fi
fi

# Create the systemd service unit
cat > /etc/systemd/system/gyds-node.service <<SERVICE
[Unit]
Description=GYDS ${NODE_TYPE^^} Node (${NODE_NAME})
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

# Ensure data and log dirs are owned by the gyds user the service runs as
chown -R gyds:gyds "${DATA_DIR}" "${LOG_DIR}"

systemctl daemon-reload
log "Systemd service created: /etc/systemd/system/gyds-node.service"

# ============================================================
# STEP 7: Configure Firewall
# ============================================================
header "Step 7/9: Configuring Firewall"

ufw allow ssh 2>/dev/null || true
ufw allow "${P2P_PORT}/tcp" 2>/dev/null || true
ufw allow "${P2P_PORT}/udp" 2>/dev/null || true

case "$NODE_TYPE" in
  main|full)
    ufw allow "${RPC_PORT}/tcp" 2>/dev/null || true
    ufw allow "${WS_PORT}/tcp" 2>/dev/null || true
    info "${NODE_TYPE^} node: RPC (${RPC_PORT}), WS (${WS_PORT}), P2P (${P2P_PORT}) opened."
    ;;
  lite)
    ufw allow "${RPC_PORT}/tcp" 2>/dev/null || true
    ufw allow "${WS_PORT}/tcp" 2>/dev/null || true
    info "Lite node: RPC (${RPC_PORT}), WS (${WS_PORT}) opened for wallets/websites."
    ;;
  validator)
    info "Validator: Only P2P (${P2P_PORT}) opened. RPC restricted to localhost."
    ;;
esac

ufw --force enable 2>/dev/null || warn "UFW not available or already enabled. Configure firewall manually if needed."
log "Firewall configured."

# ============================================================
# STEP 8: Install Management Commands
# ============================================================
header "Step 8/9: Creating Management Scripts"

cat > /usr/local/bin/gyds-start <<'MGMT'
#!/bin/bash
systemctl start gyds-node
echo "GYDS node started."
systemctl status gyds-node --no-pager -l
MGMT

cat > /usr/local/bin/gyds-stop <<'MGMT'
#!/bin/bash
systemctl stop gyds-node
echo "GYDS node stopped."
MGMT

cat > /usr/local/bin/gyds-restart <<'MGMT'
#!/bin/bash
systemctl restart gyds-node
echo "GYDS node restarted."
systemctl status gyds-node --no-pager -l
MGMT

cat > /usr/local/bin/gyds-status <<'MGMT'
#!/bin/bash
echo "=== GYDS Node Status ==="
systemctl status gyds-node --no-pager -l
echo ""
echo "=== Logs (last 20 lines) ==="
tail -20 /var/log/gyds/node.log 2>/dev/null || echo "No logs yet."
MGMT

cat > /usr/local/bin/gyds-logs <<'MGMT'
#!/bin/bash
tail -f /var/log/gyds/node.log
MGMT

cat > /usr/local/bin/gyds-console <<'MGMT'
#!/bin/bash
source /etc/gyds/node.env
geth attach "http://127.0.0.1:${RPC_PORT}"
MGMT

cat > /usr/local/bin/gyds-enode <<'MGMT'
#!/bin/bash
source /etc/gyds/node.env
geth attach --exec "admin.nodeInfo.enode" "http://127.0.0.1:${RPC_PORT}" 2>/dev/null \
  || echo "Node not running or RPC not available."
MGMT

cat > /usr/local/bin/gyds-peers <<'MGMT'
#!/bin/bash
source /etc/gyds/node.env
geth attach --exec "admin.peers.length" "http://127.0.0.1:${RPC_PORT}" 2>/dev/null \
  || echo "Node not running or RPC not available."
MGMT

chmod +x /usr/local/bin/gyds-{start,stop,restart,status,logs,console,enode,peers}
log "Management commands installed: gyds-start, gyds-stop, gyds-restart, gyds-status, gyds-logs, gyds-console, gyds-enode, gyds-peers"

# ============================================================
# STEP 9: Enable & Start the Node
# ============================================================
header "Step 9/9: Starting Node"

systemctl enable gyds-node
systemctl start gyds-node

sleep 3

if systemctl is-active --quiet gyds-node; then
  log "GYDS ${NODE_TYPE^^} node is running!"
else
  warn "Node may have failed to start. Check logs with:"
  warn "  gyds-logs"
  warn "  journalctl -u gyds-node -n 50 --no-pager"
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
    ;;
  full)
    printf "║   Syncing from MAIN: %-37s║\n" "${MAIN_NODE_IP}"
    echo "║   Once synced, share your enode with lite nodes.         ║"
    echo "║     gyds-enode                                           ║"
    ;;
  lite)
    printf "║   Syncing from FULL nodes: %-31s║\n" "${FULL_NODE_IPS}"
    echo "║                                                          ║"
    echo "║   Wallets & websites connect to:                         ║"
    printf "║     HTTP RPC: %-43s║\n" "http://${SERVER_IP}:${RPC_PORT}"
    printf "║     WS RPC:   %-43s║\n" "ws://${SERVER_IP}:${WS_PORT}"
    echo "║                                                          ║"
    echo "║   Update .env:                                           ║"
    printf "║     VITE_RPC_URL=%-41s║\n" "http://${SERVER_IP}:${RPC_PORT}"
    ;;
  validator)
    printf "║   Validator:  %-43s║\n" "${VALIDATOR_ADDRESS}"
    printf "║   MAIN node:  %-43s║\n" "${MAIN_NODE_IP}"
    echo "║   Ask the MAIN node admin to authorize you:              ║"
    printf "║     clique.propose(\"%s\", true)%-18s║\n" "${VALIDATOR_ADDRESS}" ""
    ;;
esac

echo "║                                                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Management Commands:                                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   gyds-start    — Start the node                         ║"
echo "║   gyds-stop     — Stop the node                          ║"
echo "║   gyds-restart  — Restart the node                       ║"
echo "║   gyds-status   — View status & recent logs              ║"
echo "║   gyds-logs     — Follow live logs                       ║"
echo "║   gyds-console  — Attach geth JS console                 ║"
echo "║   gyds-enode    — Show this node's enode URL             ║"
echo "║   gyds-peers    — Show connected peer count              ║"
echo "╚══════════════════════════════════════════════════════════╝"

echo ""
echo "📋 NEXT STEPS for ${NODE_TYPE^^} node:"
case "$NODE_TYPE" in
  main)
    echo "  1. Check it's running:      gyds-logs"
    echo "  2. Get your enode URL:      gyds-enode"
    echo "  3. Copy genesis.json + enode to other nodes"
    echo "  4. Point the explorer's VITE_RPC_URL to this node:"
    printf "       VITE_RPC_URL=http://%s:%s\n" "${SERVER_IP}" "${RPC_PORT}"
    ;;
  full)
    echo "  1. Verify genesis.json matches the MAIN node"
    echo "  2. Wait for sync:           gyds-console → eth.syncing"
    echo "  3. Get enode for lite nodes: gyds-enode"
    ;;
  lite)
    printf "  1. Add full node enodes to %s/geth/static-nodes.json\n" "${DATA_DIR}"
    echo "  2. Restart:                 gyds-restart"
    printf "  3. Point wallets to:        http://%s:%s\n" "${SERVER_IP}" "${RPC_PORT}"
    echo "  4. Update VITE_RPC_URL in the explorer's .env"
    ;;
  validator)
    echo "  1. Ask the MAIN node admin to run:"
    printf "       clique.propose(\"%s\", true)\n" "${VALIDATOR_ADDRESS}"
    echo "  2. Wait for sync, then mining begins automatically"
    echo "  3. Monitor:                 gyds-logs"
    ;;
esac

echo ""
log "Node setup complete!"
