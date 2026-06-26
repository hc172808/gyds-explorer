#!/bin/bash
# ============================================================
# Guardian Chain — Build & Restart Automation
# Run on the VPS after pulling new code to rebuild Go binaries
# and restart all explorer services.
# ============================================================
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/gyds-explorer}"
GO_DIR="$PROJECT_DIR/blockchain-go"
BIN_DIR="/usr/local/bin"

cd "$PROJECT_DIR"

echo "==> [1/6] Pulling latest code..."
git pull --ff-only || echo "   (skipping git pull — not a git repo)"

echo "==> [2/6] Installing frontend dependencies..."
if [ -f package.json ]; then
  npm ci --omit=dev || npm install --omit=dev
  npm run build
fi

echo "==> [3/6] Installing API service dependencies..."
for svc in api indexer feature-gate-service; do
  if [ -f "$PROJECT_DIR/$svc/package.json" ]; then
    (cd "$PROJECT_DIR/$svc" && npm ci --omit=dev || npm install --omit=dev)
  fi
done

echo "==> [4/6] Building Go blockchain binaries..."
cd "$GO_DIR"
go mod tidy
go build -o "$BIN_DIR/guardian-fullnode" ./cmd/fullnode/
go build -o "$BIN_DIR/guardian-litenode" ./cmd/litenode/
echo "   binaries installed to $BIN_DIR"

echo "==> [5/6] Restarting systemd services..."
for svc in guardian-fullnode guardian-litenode; do
  if systemctl list-unit-files | grep -q "^$svc"; then
    sudo systemctl restart "$svc"
    echo "   restarted $svc"
  fi
done

echo "==> [6/6] Reloading PM2 services..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 reload "$PROJECT_DIR/ecosystem.config.js" --update-env || \
    pm2 start "$PROJECT_DIR/ecosystem.config.js"
  pm2 save
fi

echo ""
echo "==> Health check..."
sleep 3
curl -fsS http://localhost:8545/health && echo "" && echo "✅ explorer API healthy"
curl -fsS http://localhost:3001/api/health 2>/dev/null && echo "" && echo "✅ node API healthy" || echo "ℹ️  node API health endpoint not available"

echo ""
echo "✅ Deployment complete."
