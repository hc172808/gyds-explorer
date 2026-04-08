#!/bin/bash
set -euo pipefail

NODE_NAME="guardian-litenode"
BIN_DIR="/usr/local/bin"
USER="guardian"
P2P_PORT=30304
BOOTSTRAP_NODE="${1:-}"

if [ -z "$BOOTSTRAP_NODE" ]; then
    echo "Usage: $0 <bootstrap_node_address>"
    echo "  Example: $0 10.0.0.1:30303"
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
echo "Lite node deployed! Bootstrap: $BOOTSTRAP_NODE"
echo "  sudo systemctl status guardian-litenode"
echo "  sudo journalctl -u guardian-litenode -f"
