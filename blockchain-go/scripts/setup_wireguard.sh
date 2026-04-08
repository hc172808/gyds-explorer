#!/bin/bash
set -euo pipefail

INTERFACE="wg0"
PORT=51820
NETWORK="10.10.0.0/24"
CONFIG_DIR="/etc/wireguard"

echo "=== Guardian Chain WireGuard VPN Setup ==="

# Install WireGuard
if ! command -v wg &>/dev/null; then
    sudo apt-get update && sudo apt-get install -y wireguard
fi

# Generate keys
sudo mkdir -p "$CONFIG_DIR"
PRIVATE_KEY=$(wg genkey)
PUBLIC_KEY=$(echo "$PRIVATE_KEY" | wg pubkey)

echo "Your public key: $PUBLIC_KEY"
echo "(Share this with other node operators)"

# Determine IP
read -rp "Enter this node's VPN IP (e.g., 10.10.0.1): " VPN_IP

# Create config
sudo tee "$CONFIG_DIR/$INTERFACE.conf" > /dev/null <<EOF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = $VPN_IP/24
ListenPort = $PORT
SaveConfig = true

# Add peers below:
# [Peer]
# PublicKey = <peer_public_key>
# AllowedIPs = <peer_vpn_ip>/32
# Endpoint = <peer_public_ip>:$PORT
# PersistentKeepalive = 25
EOF

sudo chmod 600 "$CONFIG_DIR/$INTERFACE.conf"

# Enable and start
sudo systemctl enable "wg-quick@$INTERFACE"
sudo systemctl start "wg-quick@$INTERFACE"

# Open firewall
sudo ufw allow $PORT/udp 2>/dev/null || true

echo ""
echo "WireGuard configured!"
echo "  Interface: $INTERFACE"
echo "  VPN IP:    $VPN_IP"
echo "  Port:      $PORT"
echo ""
echo "To add a peer:"
echo "  sudo wg set $INTERFACE peer <PUBLIC_KEY> allowed-ips <PEER_IP>/32 endpoint <PEER_ENDPOINT>:$PORT"
