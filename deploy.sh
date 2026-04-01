#!/bin/bash
# ============================================================
# GYDS Explorer - Ubuntu 22.04 Deployment Script
# ============================================================
# This script deploys the GYDS Explorer as a production build
# served by Nginx with optional SSL via Certbot.
#
# Usage:
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#
# Prerequisites: Ubuntu 22.04 with root/sudo access
# ============================================================

set -e

# ---------- Configuration ----------
APP_NAME="gyds-explorer"
APP_DIR="/var/www/${APP_NAME}"
REPO_URL="https://github.com/hc172808/gyds-explorer.git"
DOMAIN=""  # Set your domain here, or pass as argument: sudo ./deploy.sh yourdomain.com
NODE_VERSION="20"

if [ -n "$1" ]; then
  DOMAIN="$1"
fi

# ---------- Colors ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[STEP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---------- Pre-flight ----------
if [ "$EUID" -ne 0 ]; then
  err "Please run as root: sudo ./deploy.sh"
fi

echo ""
echo "============================================"
echo "   GYDS Explorer - Deployment Script"
echo "   Ubuntu 22.04"
echo "============================================"
echo ""

# ============================================================
# STEP 1: System Update
# ============================================================
log "Step 1/7 — Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git build-essential

# ============================================================
# STEP 2: Install Node.js
# ============================================================
log "Step 2/7 — Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
else
  CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$CURRENT_NODE" -lt "$NODE_VERSION" ]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
  else
    warn "Node.js $(node -v) already installed, skipping."
  fi
fi

# Install npm if not present
if ! command -v npm &> /dev/null; then
  apt-get install -y npm
fi

echo "  Node: $(node -v)"
echo "  npm:  $(npm -v)"

# ============================================================
# STEP 3: Install Nginx
# ============================================================
log "Step 3/7 — Installing Nginx..."
if ! command -v nginx &> /dev/null; then
  apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
else
  warn "Nginx already installed, skipping."
fi

# ============================================================
# STEP 4: Clone / Pull Repository
# ============================================================
log "Step 4/7 — Setting up application code..."
if [ -d "${APP_DIR}" ]; then
  warn "Directory ${APP_DIR} exists. Pulling latest changes..."
  cd "${APP_DIR}"
  git pull origin main || git pull origin master || warn "Git pull failed, using existing code."
else
  git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

# ============================================================
# STEP 5: Install Dependencies & Build
# ============================================================
log "Step 5/7 — Installing dependencies and building..."
cd "${APP_DIR}"

# Copy .env if it exists in the repo
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
  cp .env.example .env
  warn "Created .env from .env.example — edit it with your settings!"
fi

npm install
npm run build

# Verify build output
if [ ! -d "dist" ]; then
  err "Build failed — 'dist' directory not found."
fi

log "  Build complete. Output in ${APP_DIR}/dist"

# ============================================================
# STEP 6: Configure Nginx
# ============================================================
log "Step 6/7 — Configuring Nginx..."

NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}"
SERVER_NAME="${DOMAIN:-_}"

cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    root ${APP_DIR}/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — all routes serve index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
EOF

# Enable site
ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t || err "Nginx config test failed!"
systemctl reload nginx

log "  Nginx configured and reloaded."

# ============================================================
# STEP 7: SSL with Certbot (optional)
# ============================================================
if [ -n "${DOMAIN}" ] && [ "${DOMAIN}" != "_" ]; then
  log "Step 7/7 — Setting up SSL with Certbot..."
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --email "admin@${DOMAIN}" || warn "Certbot failed — you can run it manually later."
else
  log "Step 7/7 — Skipping SSL (no domain provided)."
  warn "To enable SSL later, run: sudo certbot --nginx -d yourdomain.com"
fi

# ============================================================
# Done!
# ============================================================
echo ""
echo "============================================"
echo "   ✅ GYDS Explorer deployed successfully!"
echo "============================================"
echo ""
echo "  App directory:  ${APP_DIR}"
echo "  Web root:       ${APP_DIR}/dist"
echo ""
if [ -n "${DOMAIN}" ] && [ "${DOMAIN}" != "_" ]; then
  echo "  URL: https://${DOMAIN}"
else
  echo "  URL: http://$(curl -s ifconfig.me 2>/dev/null || echo 'your-server-ip')"
fi
echo ""
echo "  Useful commands:"
echo "    sudo systemctl restart nginx    # Restart web server"
echo "    cd ${APP_DIR} && npm run build  # Rebuild after changes"
echo "    sudo certbot --nginx            # Add/renew SSL"
echo ""
echo "  To update the explorer:"
echo "    cd ${APP_DIR} && git pull && npm install && npm run build && sudo systemctl reload nginx"
echo ""
