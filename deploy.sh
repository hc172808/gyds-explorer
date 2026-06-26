#!/bin/bash
# ============================================================
# GYDS Explorer — Ubuntu 22.04 Full Deployment Script
# ============================================================
# Deploys the GYDS Explorer with:
#   - Blockchain node setup (optional, via node-setup.sh)
#   - PostgreSQL database
#   - Express API server (PM2 managed)
#   - Nginx reverse proxy + static frontend
#   - pgAdmin web interface (Apache on port 8008)
#   - Optional SSL via Certbot
#
# Usage:
#   chmod +x deploy.sh
#   sudo ./deploy.sh [domain.com]
#
# Prerequisites: Ubuntu 22.04 with root/sudo access
# ============================================================

set -e

# ---------- Configuration ----------
APP_NAME="gyds-explorer"
APP_DIR="/var/www/${APP_NAME}"
API_DIR="${APP_DIR}/api"
REPO_URL="https://github.com/hc172808/gyds-explorer.git"
DOMAIN=""
NODE_VERSION="20"

# Database defaults (will be written to .env)
DB_NAME="gyds_explorer"
DB_USER="gyds_admin"
DB_PORT="5432"
API_PORT="3001"

if [ -n "$1" ]; then
  DOMAIN="$1"
fi

# ---------- Colors ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓ STEP]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠ WARN]${NC} $1"; }
err()  { echo -e "${RED}[✗ ERROR]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[ℹ INFO]${NC} $1"; }

# ---------- Pre-flight ----------
if [ "$EUID" -ne 0 ]; then
  err "Please run as root: sudo ./deploy.sh"
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   GYDS Explorer - Full Deployment Script   ║"
echo "║   Ubuntu 22.04                             ║"
echo "╠════════════════════════════════════════════╣"
echo "║   Steps:                                   ║"
echo "║   1.  System packages                      ║"
echo "║   2.  Node.js                              ║"
echo "║   3.  PostgreSQL database                  ║"
echo "║   4.  Clone repository                     ║"
echo "║   5.  Generate .env configuration          ║"
echo "║   6.  Create API server                    ║"
echo "║   7.  Install dependencies & build         ║"
echo "║   8.  Setup PM2 process manager            ║"
echo "║   9.  Configure Nginx                      ║"
echo "║  10.  pgAdmin web interface                ║"
echo "║  11.  SSL certificate (optional)           ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Generate secure random strings
generate_password() {
  openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24
}

generate_secret() {
  openssl rand -hex 32
}

DB_PASSWORD=$(generate_password)
API_SECRET=$(generate_secret)

# ============================================================
# OPTIONAL: Run node-setup.sh first
# ============================================================
echo ""
echo "┌─────────────────────────────────────────────────────┐"
echo "│   GYDS Blockchain Node Setup (Optional)             │"
echo "│                                                     │"
echo "│   Do you want to set up a GYDS blockchain node      │"
echo "│   on this server? (main / full / lite / validator)  │"
echo "└─────────────────────────────────────────────────────┘"
echo ""
read -p "Set up a blockchain node now? [y/N]: " SETUP_NODE_CHOICE
if [[ "$SETUP_NODE_CHOICE" =~ ^[Yy]$ ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  NODE_SETUP_SCRIPT="${SCRIPT_DIR}/node-setup.sh"

  if [ ! -f "${NODE_SETUP_SCRIPT}" ]; then
    # Also check the APP_DIR in case the repo was already cloned
    NODE_SETUP_SCRIPT="${APP_DIR}/node-setup.sh"
  fi

  if [ -f "${NODE_SETUP_SCRIPT}" ]; then
    chmod +x "${NODE_SETUP_SCRIPT}"
    bash "${NODE_SETUP_SCRIPT}"
    echo ""
    log "Blockchain node setup complete. Continuing with explorer deployment..."
    echo ""
  else
    warn "node-setup.sh not found. Skipping node setup."
    warn "Place node-setup.sh in the same directory as deploy.sh and re-run to set up a node."
    echo ""
  fi
else
  info "Skipping blockchain node setup."
  echo ""
fi

# ============================================================
# STEP 1: System Update & Dependencies
# ============================================================
log "Step 1/11 — Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git build-essential software-properties-common \
  apt-transport-https ca-certificates gnupg lsb-release openssl
info "System packages installed."

# ============================================================
# STEP 2: Install Node.js
# ============================================================
log "Step 2/11 — Installing Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
else
  CURRENT_NODE=$(node -v | cut -dv -f2 | cut -d. -f1)
  if [ "$CURRENT_NODE" -lt "$NODE_VERSION" ]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
  else
    warn "Node.js $(node -v) already installed, skipping."
  fi
fi

# Install npm if missing (bundled with nodejs from nodesource, but just in case)
if ! command -v npm &> /dev/null; then
  apt-get install -y npm
fi

info "Node: $(node -v) | npm: $(npm -v)"

# ============================================================
# STEP 3: Install & Configure PostgreSQL
# ============================================================
log "Step 3/11 — Installing and configuring PostgreSQL..."

if ! command -v psql &> /dev/null; then
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
  info "PostgreSQL installed and started."
else
  warn "PostgreSQL already installed."
  systemctl start postgresql 2>/dev/null || true
fi

# Wait for PostgreSQL to be ready
sleep 2

# Create database user and database
info "Creating database user '${DB_USER}' and database '${DB_NAME}'..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

# Create application tables
info "Creating database tables..."
sudo -u postgres psql -d "${DB_NAME}" <<'EOSQL'
-- Blocks cache table
CREATE TABLE IF NOT EXISTS blocks (
    number BIGINT PRIMARY KEY,
    hash VARCHAR(66) UNIQUE NOT NULL,
    parent_hash VARCHAR(66),
    timestamp BIGINT,
    miner VARCHAR(42),
    gas_used BIGINT,
    gas_limit BIGINT,
    transaction_count INT DEFAULT 0,
    size BIGINT,
    extra_data TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Transactions cache table
CREATE TABLE IF NOT EXISTS transactions (
    hash VARCHAR(66) PRIMARY KEY,
    block_number BIGINT REFERENCES blocks(number) ON DELETE CASCADE,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42),
    value TEXT,
    gas BIGINT,
    gas_price TEXT,
    input TEXT,
    nonce BIGINT,
    transaction_index INT,
    status SMALLINT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Addresses stats table
CREATE TABLE IF NOT EXISTS addresses (
    address VARCHAR(42) PRIMARY KEY,
    balance TEXT DEFAULT '0',
    transaction_count BIGINT DEFAULT 0,
    is_contract BOOLEAN DEFAULT FALSE,
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Network stats history
CREATE TABLE IF NOT EXISTS network_stats (
    id SERIAL PRIMARY KEY,
    block_height BIGINT,
    gas_price TEXT,
    peer_count INT,
    chain_id INT,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_number);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp);
CREATE INDEX IF NOT EXISTS idx_network_stats_time ON network_stats(recorded_at);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gyds_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gyds_admin;
EOSQL

info "Database tables created successfully."

# ============================================================
# STEP 4: Clone / Pull Repository
# ============================================================
log "Step 4/11 — Setting up application code..."
if [ -d "${APP_DIR}/.git" ]; then
  warn "Directory ${APP_DIR} exists. Pulling latest changes..."
  cd "${APP_DIR}"
  git pull origin main || git pull origin master || warn "Git pull failed, using existing code."
elif [ -d "${APP_DIR}" ] && [ -f "${APP_DIR}/package.json" ]; then
  warn "Directory ${APP_DIR} exists with code but no git repo. Using existing files."
  cd "${APP_DIR}"
else
  git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

# ============================================================
# STEP 5: Generate .env Configuration
# ============================================================
log "Step 5/11 — Generating .env configuration..."

BASE_URL="http://localhost:8080"
API_URL="http://localhost:${API_PORT}/api"
if [ -n "${DOMAIN}" ] && [ "${DOMAIN}" != "_" ]; then
  BASE_URL="https://${DOMAIN}"
  API_URL="https://${DOMAIN}/api"
fi

cat > "${APP_DIR}/.env" <<EOF
# ============================================================
# GYDS Explorer Environment Configuration
# Auto-generated by deploy.sh on $(date)
# ============================================================

# ---------- RPC Configuration ----------
VITE_RPC_URL=https://rpc.netlifegy.com
VITE_RPC_URL_2=https://rpc2.netlifegy.com

# ---------- Application Settings ----------
VITE_PORT=8080
VITE_APP_TITLE=GYDS Explorer
VITE_CHAIN_ID=1
VITE_BASE_URL=${BASE_URL}

# ---------- PostgreSQL Database ----------
DB_HOST=localhost
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}

# ---------- API Server ----------
API_PORT=${API_PORT}
VITE_API_URL=${API_URL}
API_SECRET_KEY=${API_SECRET}

# ---------- Feature Gate Service ----------
FEATURE_GATE_PORT=3002
VITE_FEATURE_GATE_URL=http://localhost:3002

# ---------- Optional ----------
API_RATE_LIMIT=100
API_CORS_ORIGINS=http://localhost:8080,${BASE_URL}
EOF

chmod 600 "${APP_DIR}/.env"
info ".env file generated with secure credentials."
info "Database password saved in ${APP_DIR}/.env"

# ============================================================
# STEP 6: Create API Server
# ============================================================
log "Step 6/11 — Creating Express API server..."

mkdir -p "${API_DIR}"

cat > "${API_DIR}/package.json" <<'EOF'
{
  "name": "gyds-explorer-api",
  "version": "1.0.0",
  "description": "GYDS Explorer API Server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.12.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express-rate-limit": "^7.1.4"
  }
}
EOF

cat > "${API_DIR}/server.js" <<'SERVERJS'
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

// Load .env from parent directory
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = process.env.API_PORT || 3001;

// ---------- Database Connection ----------
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "gyds_explorer",
  user: process.env.DB_USER || "gyds_admin",
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.query("SELECT NOW()")
  .then(() => console.log("[DB] PostgreSQL connected successfully"))
  .catch((err) => console.error("[DB] PostgreSQL connection failed:", err.message));

// ---------- Middleware ----------
const allowedOrigins = (process.env.API_CORS_ORIGINS || "http://localhost:8080")
  .split(",")
  .map((s) => s.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT || "100"),
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ---------- Health Check ----------
app.get("/api/health", async (req, res) => {
  try {
    const dbResult = await pool.query("SELECT NOW() as time");
    res.json({
      status: "healthy",
      database: "connected",
      timestamp: dbResult.rows[0].time,
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", database: "disconnected", error: err.message });
  }
});

// ---------- Blocks API ----------
app.get("/api/blocks", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1");
    const limit = Math.min(parseInt(req.query.limit || "20"), 100);
    const offset = (page - 1) * limit;
    const [blocks, countResult] = await Promise.all([
      pool.query("SELECT * FROM blocks ORDER BY number DESC LIMIT $1 OFFSET $2", [limit, offset]),
      pool.query("SELECT COUNT(*) FROM blocks"),
    ]);
    res.json({
      blocks: blocks.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/blocks/:number", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM blocks WHERE number = $1", [req.params.number]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Block not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/blocks", async (req, res) => {
  try {
    const { number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, transaction_count, size, extra_data } = req.body;
    const result = await pool.query(
      `INSERT INTO blocks (number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, transaction_count, size, extra_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (number) DO UPDATE SET
         hash=EXCLUDED.hash, timestamp=EXCLUDED.timestamp, gas_used=EXCLUDED.gas_used,
         transaction_count=EXCLUDED.transaction_count
       RETURNING *`,
      [number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, transaction_count, size, extra_data]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Transactions API ----------
app.get("/api/transactions", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1");
    const limit = Math.min(parseInt(req.query.limit || "20"), 100);
    const offset = (page - 1) * limit;
    const address = req.query.address;
    let query = "SELECT * FROM transactions";
    let countQuery = "SELECT COUNT(*) FROM transactions";
    const params = [];
    const countParams = [];
    if (address) {
      query += " WHERE from_address = $1 OR to_address = $1";
      countQuery += " WHERE from_address = $1 OR to_address = $1";
      params.push(address);
      countParams.push(address);
    }
    query += ` ORDER BY block_number DESC, transaction_index ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const [txs, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);
    res.json({
      transactions: txs.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/transactions/:hash", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM transactions WHERE hash = $1", [req.params.hash]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Transaction not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Addresses API ----------
app.get("/api/addresses/:address", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM addresses WHERE address = $1", [req.params.address]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Address not found in cache" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Network Stats API ----------
app.get("/api/stats", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM network_stats ORDER BY recorded_at DESC LIMIT 1");
    if (result.rows.length === 0) return res.json({ message: "No stats recorded yet" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stats/history", async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours || "24"), 168);
    const result = await pool.query(
      "SELECT * FROM network_stats WHERE recorded_at > NOW() - INTERVAL '1 hour' * $1 ORDER BY recorded_at ASC",
      [hours]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stats", async (req, res) => {
  try {
    const { block_height, gas_price, peer_count, chain_id } = req.body;
    const result = await pool.query(
      "INSERT INTO network_stats (block_height, gas_price, peer_count, chain_id) VALUES ($1,$2,$3,$4) RETURNING *",
      [block_height, gas_price, peer_count, chain_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Search API ----------
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Query parameter 'q' is required" });
    if (/^\d+$/.test(q)) {
      const block = await pool.query("SELECT * FROM blocks WHERE number = $1", [q]);
      if (block.rows.length > 0) return res.json({ type: "block", data: block.rows[0] });
    }
    if (/^0x[a-fA-F0-9]{64}$/.test(q)) {
      const tx = await pool.query("SELECT * FROM transactions WHERE hash = $1", [q]);
      if (tx.rows.length > 0) return res.json({ type: "transaction", data: tx.rows[0] });
      const block = await pool.query("SELECT * FROM blocks WHERE hash = $1", [q]);
      if (block.rows.length > 0) return res.json({ type: "block", data: block.rows[0] });
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
      const addr = await pool.query("SELECT * FROM addresses WHERE address = $1", [q.toLowerCase()]);
      if (addr.rows.length > 0) return res.json({ type: "address", data: addr.rows[0] });
      return res.json({ type: "address", data: { address: q, message: "Address not yet cached" } });
    }
    res.status(404).json({ error: "No results found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`[API] GYDS Explorer API running on port ${PORT}`);
  console.log(`[API] Health check: http://localhost:${PORT}/api/health`);
});
SERVERJS

info "API server files created at ${API_DIR}"

# ============================================================
# STEP 7: Install Dependencies & Build
# ============================================================
log "Step 7/11 — Installing dependencies and building..."
cd "${APP_DIR}"

# Frontend dependencies
npm install --legacy-peer-deps

# API dependencies
cd "${API_DIR}"
npm install --legacy-peer-deps
cd "${APP_DIR}"

# Install feature-gate-service dependencies if present
if [ -d "${APP_DIR}/feature-gate-service" ]; then
  cd "${APP_DIR}/feature-gate-service"
  npm install --legacy-peer-deps
  cd "${APP_DIR}"
fi

# Install indexer dependencies if present
if [ -d "${APP_DIR}/indexer" ]; then
  cd "${APP_DIR}/indexer"
  npm install --legacy-peer-deps
  cd "${APP_DIR}"
fi

# Build frontend
npm run build

if [ ! -d "${APP_DIR}/dist" ]; then
  err "Build failed — 'dist' directory not found in ${APP_DIR}."
fi

info "Frontend built to ${APP_DIR}/dist"

# ============================================================
# STEP 8: Setup PM2 Process Manager
# ============================================================
log "Step 8/11 — Setting up PM2 process manager..."

npm install -g pm2 2>/dev/null || true

# Stop existing processes if any
pm2 delete gyds-api 2>/dev/null || true
pm2 delete gyds-indexer 2>/dev/null || true
pm2 delete gyds-feature-gates 2>/dev/null || true

# Use ecosystem config if available
if [ -f "${APP_DIR}/ecosystem.config.js" ]; then
  cd "${APP_DIR}"
  pm2 start ecosystem.config.js
  info "All services started via PM2 ecosystem config."
else
  # Start API server
  cd "${API_DIR}"
  pm2 start server.js --name gyds-api --env production

  # Start indexer if present
  if [ -d "${APP_DIR}/indexer" ] && [ -f "${APP_DIR}/indexer/indexer.js" ]; then
    cd "${APP_DIR}/indexer"
    pm2 start indexer.js --name gyds-indexer --env production
    info "Block indexer started via PM2."
  fi

  # Start feature gate service if present
  if [ -d "${APP_DIR}/feature-gate-service" ] && [ -f "${APP_DIR}/feature-gate-service/server.js" ]; then
    cd "${APP_DIR}/feature-gate-service"
    pm2 start server.js --name gyds-feature-gates --env production
    info "Feature Gate Service started via PM2."
  fi
fi

pm2 save

# Setup PM2 to start on boot
env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root 2>/dev/null || true

cd "${APP_DIR}"
info "Services running via PM2. Use 'pm2 list' to check status."

# ============================================================
# STEP 9: Configure Nginx
# ============================================================
log "Step 9/11 — Installing and configuring Nginx..."

if ! command -v nginx &> /dev/null; then
  apt-get install -y nginx
  systemctl enable nginx
  systemctl start nginx
fi

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

    # Proxy API requests to Express server
    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Proxy Feature Gate Service requests
    location /fgate/ {
        proxy_pass http://127.0.0.1:3002/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Proxy pgAdmin (Apache runs on port 8008 to avoid nginx conflict)
    location /pgadmin4/ {
        proxy_pass http://127.0.0.1:8008/pgadmin4/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Script-Name /pgadmin4;
        proxy_redirect off;
    }

    # SPA fallback — all other routes serve index.html
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

ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t || err "Nginx config test failed! Check the config at ${NGINX_CONF}"
systemctl reload nginx

info "Nginx configured with API reverse proxy."

# ============================================================
# STEP 10: Install pgAdmin Web Interface
# ============================================================
log "Step 10/11 — Installing pgAdmin web interface..."

if ! dpkg -l pgadmin4-web &>/dev/null; then
  curl -fsSL https://www.pgadmin.org/static/packages_pgadmin_org.pub \
    | gpg --dearmor -o /usr/share/keyrings/pgadmin-archive-keyring.gpg 2>/dev/null || true
  echo "deb [signed-by=/usr/share/keyrings/pgadmin-archive-keyring.gpg] \
https://ftp.postgresql.org/pub/pgadmin/pgadmin4/apt/$(lsb_release -cs) pgadmin4 main" \
    > /etc/apt/sources.list.d/pgadmin4.list
  apt-get update -y
  apt-get install -y pgadmin4-web
  info "pgAdmin4 installed."
else
  warn "pgAdmin4 already installed."
fi

# --- Move Apache off port 80 so it doesn't conflict with Nginx ---
# pgAdmin4-web uses Apache; we move Apache to port 8008
if command -v apache2 &>/dev/null; then
  # Update ports.conf
  sed -i 's/^Listen 80$/Listen 8008/' /etc/apache2/ports.conf
  # Update default vhost to listen on 8008
  if [ -f /etc/apache2/sites-available/000-default.conf ]; then
    sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8008>/' /etc/apache2/sites-available/000-default.conf
  fi
  info "Apache moved to port 8008 to avoid conflict with Nginx."
fi

# Generate pgAdmin credentials
PGADMIN_EMAIL="admin@${DOMAIN:-gyds.local}"
PGADMIN_PASSWORD=$(generate_password)

# Configure pgAdmin
export PGADMIN_SETUP_EMAIL="${PGADMIN_EMAIL}"
export PGADMIN_SETUP_PASSWORD="${PGADMIN_PASSWORD}"
/usr/pgadmin4/bin/setup-web.sh --yes 2>/dev/null || warn "pgAdmin web setup script returned non-zero (may be normal on re-runs)."

# Restart Apache after port change
if command -v apache2 &>/dev/null; then
  systemctl restart apache2 2>/dev/null || warn "Apache2 restart failed — check 'systemctl status apache2'."
fi

# Save pgAdmin credentials to .env
cat >> "${APP_DIR}/.env" <<EOF

# ---------- pgAdmin Web Interface ----------
PGADMIN_EMAIL=${PGADMIN_EMAIL}
PGADMIN_PASSWORD=${PGADMIN_PASSWORD}
PGADMIN_URL=http://your-server/pgadmin4
EOF

# Reload nginx so the /pgadmin4/ proxy block takes effect
nginx -t && systemctl reload nginx

info "pgAdmin configured."
info "  Access via: http://your-server/pgadmin4"
info "  Email:      ${PGADMIN_EMAIL}"
info "  Password:   ${PGADMIN_PASSWORD}  (also saved in ${APP_DIR}/.env)"

# ============================================================
# STEP 11: SSL with Certbot (optional)
# ============================================================
if [ -n "${DOMAIN}" ] && [ "${DOMAIN}" != "_" ]; then
  log "Step 11/11 — Setting up SSL with Certbot..."
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos \
    --email "admin@${DOMAIN}" || warn "Certbot failed — run manually: certbot --nginx -d ${DOMAIN}"
else
  log "Step 11/11 — Skipping SSL (no domain provided)."
  warn "To add SSL later: sudo certbot --nginx -d yourdomain.com"
fi

# ============================================================
# Summary
# ============================================================
SERVER_IP=$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   ✅ GYDS Explorer deployed successfully!              ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║                                                        ║"
printf "║   📁 App directory:  %-35s║\n" "${APP_DIR}"
printf "║   🌐 Web root:       %-35s║\n" "${APP_DIR}/dist"
printf "║   🔌 API server:     %-35s║\n" "http://localhost:${API_PORT}/api"
printf "║   🗄️  Database:       %-35s║\n" "${DB_NAME} @ localhost:${DB_PORT}"
printf "║   👤 DB User:        %-35s║\n" "${DB_USER}"
echo "║   🔑 DB Password:    saved in ${APP_DIR}/.env          ║"
printf "║   📊 pgAdmin:        %-35s║\n" "http://${SERVER_IP}/pgadmin4"
echo "║                                                        ║"
if [ -n "${DOMAIN}" ] && [ "${DOMAIN}" != "_" ]; then
  printf "║   🌍 URL: %-47s║\n" "https://${DOMAIN}"
else
  printf "║   🌍 URL: %-47s║\n" "http://${SERVER_IP}"
fi
echo "║                                                        ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║   Useful commands:                                     ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║                                                        ║"
echo "║   # Check API health                                   ║"
printf "║   curl http://localhost:%s/api/health%-17s║\n" "${API_PORT}" ""
echo "║                                                        ║"
echo "║   # View API logs                                      ║"
echo "║   pm2 logs gyds-api                                    ║"
echo "║                                                        ║"
echo "║   # Restart services                                   ║"
echo "║   pm2 restart all                                      ║"
echo "║   sudo systemctl restart nginx                         ║"
echo "║   sudo systemctl restart postgresql                    ║"
echo "║                                                        ║"
echo "║   # Access database via CLI                            ║"
printf "║   psql -U %s -d %s -h localhost%-9s║\n" "${DB_USER}" "${DB_NAME}" ""
echo "║                                                        ║"
echo "║   # Rebuild after code changes                         ║"
printf "║   cd %s && npm run build%-22s║\n" "${APP_DIR}" ""
echo "║   sudo systemctl reload nginx                          ║"
echo "║                                                        ║"
echo "║   # Update from git                                    ║"
printf "║   cd %s && git pull%-24s║\n" "${APP_DIR}" ""
echo "║   npm install --legacy-peer-deps && npm run build      ║"
echo "║   pm2 restart all                                      ║"
echo "║                                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
