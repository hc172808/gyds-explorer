#!/bin/bash
set -euo pipefail

NODE_NAME="guardian-fullnode"
DATA_DIR="/var/lib/guardian-chain"
BIN_DIR="/usr/local/bin"
USER="guardian"
P2P_PORT=30303
API_PORT=8545

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
    --datadir=$DATA_DIR \\
    --listen=:$P2P_PORT \\
    --api=:$API_PORT \\
    --miner=\${MINER_ADDRESS:-}
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
echo "  P2P port: $P2P_PORT"
echo "  API port: $API_PORT"
echo "  Data dir: $DATA_DIR"
echo ""
echo "Commands:"
echo "  sudo systemctl status guardian-fullnode"
echo "  sudo journalctl -u guardian-fullnode -f"
