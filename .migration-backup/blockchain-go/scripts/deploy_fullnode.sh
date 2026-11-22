#!/bin/bash
set -euo pipefail

NODE_NAME="guardian-fullnode"
DATA_DIR="/var/lib/guardian-chain"
BIN_DIR="/usr/local/bin"
USER="guardian"
P2P_PORT=30303
API_PORT=8545
NETWORK="${1:-}"
BOOTSTRAP_NODE="${2:-}"
MINER_ADDRESS="${MINER_ADDRESS:-}"

if [[ "$NETWORK" != "mainnet" && "$NETWORK" != "testnet" ]]; then
    echo "Usage: $0 <mainnet|testnet> [bootstrap_node_address]"
    exit 1
fi
if [[ -n "$BOOTSTRAP_NODE" && ! "$BOOTSTRAP_NODE" =~ ^[A-Za-z0-9.-]+:[0-9]{1,5}$ ]]; then
    echo "Invalid bootstrap node address; use hostname:port or IPv4:port."
    exit 1
fi
if [[ -n "$MINER_ADDRESS" && ! "$MINER_ADDRESS" =~ ^0[xX][0-9a-fA-F]{40}$ ]]; then
    echo "MINER_ADDRESS must be a 20-byte 0x-prefixed address."
    exit 1
fi

echo "=== Guardian Chain Full Node Deployment ==="

# Create system user
if ! id "$USER" &>/dev/null; then
    sudo useradd --system --no-create-home --shell /bin/false "$USER"
    echo "Created system user: $USER"
fi

# Create data directory
sudo mkdir -p "$DATA_DIR"
sudo chown "$USER:$USER" "$DATA_DIR"

# Build binary
echo "Building full node..."
cd "$(dirname "$0")/.."
go build -o "$BIN_DIR/guardian-fullnode" ./cmd/fullnode/
echo "Binary installed to $BIN_DIR/guardian-fullnode"

# Create systemd service
sudo tee /etc/systemd/system/guardian-fullnode.service > /dev/null <<EOF
[Unit]
Description=Guardian Chain Full Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
ExecStart=$BIN_DIR/guardian-fullnode \\
    --network=$NETWORK \\
    --datadir=$DATA_DIR \\
    --listen=:$P2P_PORT \\
    --api=:$API_PORT \\
    --bootstrap=$BOOTSTRAP_NODE \\
    --miner=$MINER_ADDRESS
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Reload and start
sudo systemctl daemon-reload
sudo systemctl enable guardian-fullnode
sudo systemctl restart guardian-fullnode

echo ""
echo "Full node deployed successfully!"
echo "  Network:  $NETWORK"
echo "  P2P port: $P2P_PORT"
echo "  API port: $API_PORT"
echo "  Data dir: $DATA_DIR"
echo ""
echo "Commands:"
echo "  sudo systemctl status guardian-fullnode"
echo "  sudo journalctl -u guardian-fullnode -f"
