#!/bin/bash
set -euo pipefail

NODE_NAME="guardian-litenode"
BIN_DIR="/usr/local/bin"
USER="guardian"
P2P_PORT=30304
NETWORK="${1:-}"
BOOTSTRAP_NODE="${2:-}"

if [[ "$NETWORK" != "mainnet" && "$NETWORK" != "testnet" ]] || [ -z "$BOOTSTRAP_NODE" ]; then
    echo "Usage: $0 <mainnet|testnet> <bootstrap_node_address>"
    echo "  Example: $0 testnet 10.0.0.1:30303"
    exit 1
fi
if [[ ! "$BOOTSTRAP_NODE" =~ ^[A-Za-z0-9.-]+:[0-9]{1,5}$ ]]; then
    echo "Invalid bootstrap node address; use hostname:port or IPv4:port."
    exit 1
fi

echo "=== Guardian Chain Lite Node Deployment ==="

# Create system user
if ! id "$USER" &>/dev/null; then
    sudo useradd --system --no-create-home --shell /bin/false "$USER"
fi

# Build binary
echo "Building lite node..."
cd "$(dirname "$0")/.."
go build -o "$BIN_DIR/guardian-litenode" ./cmd/litenode/
echo "Binary installed to $BIN_DIR/guardian-litenode"

# Create systemd service
sudo tee /etc/systemd/system/guardian-litenode.service > /dev/null <<EOF
[Unit]
Description=Guardian Chain Lite Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
ExecStart=$BIN_DIR/guardian-litenode \\
    --network=$NETWORK \\
    --listen=:$P2P_PORT \\
    --bootstrap=$BOOTSTRAP_NODE
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable guardian-litenode
sudo systemctl restart guardian-litenode

echo ""
echo "Lite node deployed! Network: $NETWORK; bootstrap: $BOOTSTRAP_NODE"
echo "  sudo systemctl status guardian-litenode"
echo "  sudo journalctl -u guardian-litenode -f"
