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

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[ℹ]${NC} $1"; }
header() { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}\n"; }

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

# Main node defaults (only 1 main node in the network)
MAIN_NODE_IP=""
MAIN_NODE_ENODE=""

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║       GYDS Network - Node Setup Script         ║"
echo "╠════════════════════════════════════════════════╣"
echo "║                                                ║"
echo "║   Select node type to install:                 ║"
echo "║                                                ║"
echo "║   1) MAIN    — Primary authority node          ║"
echo "║               (only ONE per network)           ║"
echo "║                                                ║"
echo "║   2) FULL    — Complete chain replica           ║"
echo "║               (syncs from Main node)           ║"
echo "║                                                ║"
echo "║   3) LITE    — Lightweight RPC endpoint         ║"
echo "║               (syncs from Full nodes)          ║"
echo "║               (wallets & websites connect here)║"
echo "║                                                ║"
echo "║   4) VALIDATOR — Full node + consensus          ║"
echo "║               (syncs from Main, seals blocks)  ║"
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
    read -p "Enter MAIN node enode URL (or press Enter to use IP-based discovery): " MAIN_NODE_ENODE
  elif [ "$NODE_TYPE" = "lite" ]; then
    info "Lite nodes sync from FULL nodes."
    read -p "Enter FULL node IP address (comma-separated for multiple): " FULL_NODE_IPS
    [ -z "$FULL_NODE_IPS" ] && err "At least one Full node IP is required for lite nodes."
  fi
fi

if [ "$NODE_TYPE" = "validator" ]; then
  echo ""
  info "Validator nodes need a signing account."
  read -p "Enter validator account address (0x...): " VALIDATOR_ADDRESS
  read -p "Enter validator account password: " VALIDATOR_PASSWORD
fi

# ============================================================
# STEP 1: System Dependencies
# ============================================================
header "Step 1: Installing System Dependencies"

apt-get update -y
apt-get install -y curl wget git build-essential software-properties-common \
  apt-transport-https ca-certificates openssl ufw jq

log "System dependencies installed."

# ============================================================
# STEP 2: Install Geth (Go-Ethereum)
# ============================================================
header "Step 2: Installing Geth"

if command -v geth &> /dev/null; then
  warn "Geth already installed: $(geth version | head -1)"
else
  info "Adding Ethereum PPA and installing geth..."
  add-apt-repository -y ppa:ethereum/ethereum 2>/dev/null || {
    info "PPA failed, downloading geth binary directly..."
    ARCH=$(dpkg --print-architecture)
    GETH_URL="https://gethstore.blob.core.windows.net/builds/geth-linux-${ARCH}-${GETH_VERSION}.tar.gz"
    cd /tmp
    wget -q "${GETH_URL}" -O geth.tar.gz || {
      warn "Direct download failed. Installing from apt..."
      apt-get install -y ethereum 2>/dev/null || err "Failed to install geth. Please install manually."
    }
    if [ -f geth.tar.gz ]; then
      tar xzf geth.tar.gz
      cp geth-linux-*/geth /usr/local/bin/
      rm -rf geth.tar.gz geth-linux-*
    fi
  }
  apt-get install -y ethereum 2>/dev/null || true
fi

if command -v geth &> /dev/null; then
  log "Geth installed: $(geth version 2>/dev/null | head -1)"
else
  warn "Geth binary not found in PATH. You may need to install it manually."
fi

# ============================================================
# STEP 3: Create Directories & User
# ============================================================
header "Step 3: Setting Up Directories"

mkdir -p "${DATA_DIR}" "${CONFIG_DIR}" "${LOG_DIR}"

# Create a dedicated user for running the node
id -u gyds &>/dev/null || useradd --system --no-create-home --shell /bin/false gyds

log "Directories created: ${DATA_DIR}, ${CONFIG_DIR}, ${LOG_DIR}"

# ============================================================
# STEP 4: Generate Genesis File (Main Node) or Copy Config
# ============================================================
header "Step 4: Chain Configuration"

if [ "$NODE_TYPE" = "main" ]; then
  info "Generating genesis file for MAIN node..."

  # Generate a new account for the main node
  ACCOUNT_PASSWORD=$(openssl rand -base64 16)
  echo "${ACCOUNT_PASSWORD}" > "${CONFIG_DIR}/account-password.txt"
  chmod 600 "${CONFIG_DIR}/account-password.txt"

  ACCOUNT_OUTPUT=$(geth account new --datadir "${DATA_DIR}" --password "${CONFIG_DIR}/account-password.txt" 2>&1)
  MAIN_ACCOUNT=$(echo "${ACCOUNT_OUTPUT}" | grep -oP '0x[a-fA-F0-9]{40}' | head -1)

  if [ -z "$MAIN_ACCOUNT" ]; then
    warn "Could not auto-detect account address. Creating manually..."
    MAIN_ACCOUNT="0x0000000000000000000000000000000000000001"
  fi

  info "Main node account: ${MAIN_ACCOUNT}"

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
  "extradata": "0x0000000000000000000000000000000000000000000000000000000000000000${MAIN_ACCOUNT:2}0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "alloc": {
    "${MAIN_ACCOUNT}": {
      "balance": "1000000000000000000000000000"
    }
  }
}
GENESIS

  log "Genesis file created at ${CONFIG_DIR}/genesis.json"

  # Initialize the chain
  info "Initializing blockchain data directory..."
  geth init --datadir "${DATA_DIR}" "${CONFIG_DIR}/genesis.json"
  log "Blockchain initialized."

else
  info "For ${NODE_TYPE} nodes, the genesis.json must match the MAIN node."
  
  if [ -f "${CONFIG_DIR}/genesis.json" ]; then
    warn "Existing genesis.json found, using it."
  else
    echo ""
    info "You need to copy genesis.json from the MAIN node."
    info "Place it at: ${CONFIG_DIR}/genesis.json"
    read -p "Enter path to genesis.json (or press Enter to create placeholder): " GENESIS_PATH
    
    if [ -n "$GENESIS_PATH" ] && [ -f "$GENESIS_PATH" ]; then
      cp "$GENESIS_PATH" "${CONFIG_DIR}/genesis.json"
      log "Genesis file copied."
    else
      warn "Creating placeholder genesis.json - you MUST replace this with the real one from MAIN node."
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
    
    # Initialize
    geth init --datadir "${DATA_DIR}" "${CONFIG_DIR}/genesis.json"
    log "Blockchain initialized with genesis."
  fi
fi

# ============================================================
# STEP 5: Generate Node Environment Configuration
# ============================================================
header "Step 5: Environment Configuration"

SERVER_IP=$(curl -sf ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

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
FULL_NODE_IPS=${FULL_NODE_IPS:-}

# ---------- Validator Settings ----------
VALIDATOR_ADDRESS=${VALIDATOR_ADDRESS:-}

# ---------- Performance ----------
CACHE_SIZE=1024
MAX_PEERS=50
NODEENV

chmod 600 "${CONFIG_DIR}/node.env"

# Write validator password if applicable
if [ "$NODE_TYPE" = "validator" ] && [ -n "$VALIDATOR_PASSWORD" ]; then
  echo "${VALIDATOR_PASSWORD}" > "${CONFIG_DIR}/validator-password.txt"
  chmod 600 "${CONFIG_DIR}/validator-password.txt"
fi

log "Environment written to ${CONFIG_DIR}/node.env"

# ============================================================
# STEP 6: Build Geth Startup Command & Service
# ============================================================
header "Step 6: Creating Systemd Service"

# Build the geth command based on node type
GETH_CMD="geth"
GETH_ARGS=""

# Common args
GETH_ARGS+=" --datadir ${DATA_DIR}"
GETH_ARGS+=" --networkid ${NETWORK_ID}"
GETH_ARGS+=" --port ${P2P_PORT}"
GETH_ARGS+=" --metrics --metrics.addr 0.0.0.0 --metrics.port ${METRICS_PORT}"
GETH_ARGS+=" --verbosity 3"

case "$NODE_TYPE" in
  main)
    GETH_ARGS+=" --http --http.addr 0.0.0.0 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool,debug,clique,admin"
    GETH_ARGS+=" --http.corsdomain '*'"
    GETH_ARGS+=" --http.vhosts '*'"
    GETH_ARGS+=" --ws --ws.addr 0.0.0.0 --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3,txpool"
    GETH_ARGS+=" --ws.origins '*'"
    GETH_ARGS+=" --mine --miner.etherbase ${MAIN_ACCOUNT:-0x0000000000000000000000000000000000000001}"
    GETH_ARGS+=" --unlock ${MAIN_ACCOUNT:-0x0000000000000000000000000000000000000001}"
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
    GETH_ARGS+=" --http.corsdomain '*'"
    GETH_ARGS+=" --http.vhosts '*'"
    GETH_ARGS+=" --ws --ws.addr 0.0.0.0 --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3,txpool"
    GETH_ARGS+=" --ws.origins '*'"
    GETH_ARGS+=" --syncmode full"
    GETH_ARGS+=" --gcmode full"
    GETH_ARGS+=" --maxpeers 50"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    # Boot node is the main node
    if [ -n "$MAIN_NODE_ENODE" ]; then
      GETH_ARGS+=" --bootnodes ${MAIN_NODE_ENODE}"
    fi
    ;;

  lite)
    GETH_ARGS+=" --http --http.addr 0.0.0.0 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3"
    GETH_ARGS+=" --http.corsdomain '*'"
    GETH_ARGS+=" --http.vhosts '*'"
    GETH_ARGS+=" --ws --ws.addr 0.0.0.0 --ws.port ${WS_PORT}"
    GETH_ARGS+=" --ws.api eth,net,web3"
    GETH_ARGS+=" --ws.origins '*'"
    GETH_ARGS+=" --syncmode light"
    GETH_ARGS+=" --maxpeers 25"
    GETH_ARGS+=" --light.serve 50"
    GETH_ARGS+=" --nat extip:${SERVER_IP}"
    # Connect to full nodes
    if [ -n "$FULL_NODE_IPS" ]; then
      # Build static-nodes from IPs
      info "Lite node will discover full nodes via ${FULL_NODE_IPS}"
    fi
    if [ -n "$MAIN_NODE_ENODE" ]; then
      GETH_ARGS+=" --bootnodes ${MAIN_NODE_ENODE}"
    fi
    ;;

  validator)
    GETH_ARGS+=" --http --http.addr 127.0.0.1 --http.port ${RPC_PORT}"
    GETH_ARGS+=" --http.api eth,net,web3,txpool,clique"
    GETH_ARGS+=" --http.corsdomain 'localhost'"
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

# Create static-nodes.json for full/lite nodes
if [ "$NODE_TYPE" = "full" ] && [ -n "$MAIN_NODE_ENODE" ]; then
  cat > "${DATA_DIR}/static-nodes.json" <<STATIC
[
  "${MAIN_NODE_ENODE}"
]
STATIC
  log "Static nodes configured for MAIN peer."
fi

if [ "$NODE_TYPE" = "lite" ] && [ -n "$FULL_NODE_IPS" ]; then
  info "For lite nodes, add full node enodes to ${DATA_DIR}/static-nodes.json"
  echo "[]" > "${DATA_DIR}/static-nodes.json"
  warn "You need to add full node enode URLs to ${DATA_DIR}/static-nodes.json"
fi

# Create systemd service
cat > /etc/systemd/system/gyds-node.service <<SERVICE
[Unit]
Description=GYDS ${NODE_TYPE^^} Node (${NODE_NAME})
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=${CONFIG_DIR}/node.env
ExecStart=${GETH_CMD}${GETH_ARGS}
Restart=always
RestartSec=5
LimitNOFILE=65536

# Logging
StandardOutput=append:${LOG_DIR}/node.log
StandardError=append:${LOG_DIR}/node-error.log

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
log "Systemd service created: gyds-node.service"

# ============================================================
# STEP 7: Configure Firewall
# ============================================================
header "Step 7: Configuring Firewall"

ufw allow ssh 2>/dev/null || true
ufw allow ${P2P_PORT}/tcp 2>/dev/null || true
ufw allow ${P2P_PORT}/udp 2>/dev/null || true

case "$NODE_TYPE" in
  main)
    ufw allow ${RPC_PORT}/tcp 2>/dev/null || true
    ufw allow ${WS_PORT}/tcp 2>/dev/null || true
    info "Main node: RPC (${RPC_PORT}), WS (${WS_PORT}), P2P (${P2P_PORT}) opened."
    ;;
  full)
    ufw allow ${RPC_PORT}/tcp 2>/dev/null || true
    ufw allow ${WS_PORT}/tcp 2>/dev/null || true
    info "Full node: RPC (${RPC_PORT}), WS (${WS_PORT}), P2P (${P2P_PORT}) opened."
    ;;
  lite)
    ufw allow ${RPC_PORT}/tcp 2>/dev/null || true
    ufw allow ${WS_PORT}/tcp 2>/dev/null || true
    info "Lite node: RPC (${RPC_PORT}), WS (${WS_PORT}) opened for wallets/websites."
    ;;
  validator)
    info "Validator: Only P2P (${P2P_PORT}) opened. RPC restricted to localhost."
    ;;
esac

ufw --force enable 2>/dev/null || warn "UFW not available, configure firewall manually."
log "Firewall configured."

# ============================================================
# STEP 8: Create Management Scripts
# ============================================================
header "Step 8: Creating Management Scripts"

# Start/stop/status helpers
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
geth attach http://127.0.0.1:${RPC_PORT}
MGMT

cat > /usr/local/bin/gyds-enode <<'MGMT'
#!/bin/bash
source /etc/gyds/node.env
geth attach --exec "admin.nodeInfo.enode" http://127.0.0.1:${RPC_PORT} 2>/dev/null || echo "Node not running."
MGMT

cat > /usr/local/bin/gyds-peers <<'MGMT'
#!/bin/bash
source /etc/gyds/node.env
geth attach --exec "admin.peers.length" http://127.0.0.1:${RPC_PORT} 2>/dev/null || echo "Node not running."
MGMT

chmod +x /usr/local/bin/gyds-*
log "Management commands installed: gyds-start, gyds-stop, gyds-status, gyds-logs, gyds-console, gyds-enode, gyds-peers"

# ============================================================
# STEP 9: Start the Node
# ============================================================
header "Step 9: Starting Node"

chown -R root:root "${DATA_DIR}" "${CONFIG_DIR}" "${LOG_DIR}"

systemctl enable gyds-node
systemctl start gyds-node

sleep 3

if systemctl is-active --quiet gyds-node; then
  log "GYDS ${NODE_TYPE^^} node is running!"
else
  warn "Node may have failed to start. Check logs:"
  warn "  tail -50 ${LOG_DIR}/node.log"
  warn "  tail -50 ${LOG_DIR}/node-error.log"
fi

# ============================================================
# STEP 10: Print Summary
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ✅ GYDS ${NODE_TYPE^^} Node Installed Successfully!           "
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║   Node: ${NODE_NAME}"
echo "║   Type: ${NODE_TYPE^^}"
echo "║   IP:   ${SERVER_IP}"
echo "║   Data: ${DATA_DIR}"
echo "║                                                          ║"
echo "║   Ports:                                                 ║"
echo "║     P2P:     ${P2P_PORT}                                 "
echo "║     RPC:     ${RPC_PORT}                                 "
echo "║     WS:      ${WS_PORT}                                  "
echo "║     Metrics: ${METRICS_PORT}                              "
echo "║                                                          ║"

case "$NODE_TYPE" in
  main)
    echo "║   ⚠ IMPORTANT: This is the MAIN node!                   ║"
    echo "║   Share your enode URL with full/lite nodes:             ║"
    echo "║     gyds-enode                                           ║"
    echo "║                                                          ║"
    echo "║   Copy genesis.json to other nodes:                      ║"
    echo "║     ${CONFIG_DIR}/genesis.json                           "
    echo "║                                                          ║"
    if [ -n "$MAIN_ACCOUNT" ]; then
      echo "║   Main account: ${MAIN_ACCOUNT}                         "
      echo "║   Account password: ${CONFIG_DIR}/account-password.txt  "
    fi
    ;;
  full)
    echo "║   Syncing from MAIN node: ${MAIN_NODE_IP}               "
    echo "║   Full nodes serve lite nodes.                           ║"
    echo "║   Share enode with lite nodes: gyds-enode                ║"
    ;;
  lite)
    echo "║   Syncing from FULL nodes: ${FULL_NODE_IPS}             "
    echo "║                                                          ║"
    echo "║   Wallets & websites connect to:                         ║"
    echo "║     HTTP RPC: http://${SERVER_IP}:${RPC_PORT}            "
    echo "║     WS RPC:   ws://${SERVER_IP}:${WS_PORT}              "
    echo "║                                                          ║"
    echo "║   Set these in your .env:                                ║"
    echo "║     VITE_RPC_URL=http://${SERVER_IP}:${RPC_PORT}        "
    ;;
  validator)
    echo "║   Validator: ${VALIDATOR_ADDRESS}                        "
    echo "║   Syncing from MAIN node: ${MAIN_NODE_IP}               "
    echo "║   Mining/sealing blocks for consensus.                   ║"
    ;;
esac

echo "║                                                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Management Commands:                                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   gyds-start    — Start the node                         ║"
echo "║   gyds-stop     — Stop the node                          ║"
echo "║   gyds-status   — View node status & logs                ║"
echo "║   gyds-logs     — Follow live logs                       ║"
echo "║   gyds-console  — Attach JS console                      ║"
echo "║   gyds-enode    — Show this node's enode URL              ║"
echo "║   gyds-peers    — Show connected peer count               ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ---------- Node-Type Specific Next Steps ----------
echo ""
case "$NODE_TYPE" in
  main)
    echo "📋 NEXT STEPS for MAIN node:"
    echo "  1. Wait for the node to fully start: gyds-logs"
    echo "  2. Get your enode URL: gyds-enode"
    echo "  3. Share genesis.json + enode URL with other nodes"
    echo "  4. Deploy the explorer with deploy.sh on this or another server"
    echo "  5. Point VITE_RPC_URL to this node's RPC"
    ;;
  full)
    echo "📋 NEXT STEPS for FULL node:"
    echo "  1. Ensure genesis.json matches the MAIN node"
    echo "  2. Wait for sync: gyds-console then eth.syncing"
    echo "  3. Share enode URL with lite nodes: gyds-enode"
    ;;
  lite)
    echo "📋 NEXT STEPS for LITE node:"
    echo "  1. Add full node enodes to ${DATA_DIR}/static-nodes.json"
    echo "  2. Restart: gyds-stop && gyds-start"
    echo "  3. Point wallets/websites to http://${SERVER_IP}:${RPC_PORT}"
    echo "  4. Update .env: VITE_RPC_URL=http://${SERVER_IP}:${RPC_PORT}"
    ;;
  validator)
    echo "📋 NEXT STEPS for VALIDATOR node:"
    echo "  1. Ask a MAIN node admin to authorize your address via clique.propose"
    echo "  2. Wait for sync, then mining will begin automatically"
    echo "  3. Monitor: gyds-logs"
    ;;
esac

echo ""
log "Setup complete!"
