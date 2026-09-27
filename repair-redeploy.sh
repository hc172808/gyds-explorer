#!/bin/bash
# ============================================================
# GYDS Explorer — Repair and Redeploy
# ============================================================
# Repairs a server left half-installed by an interrupted deployment.
# It:
#   1. Stops application services.
#   2. Backs up .env and, when requested, node/config/log data.
#   3. Resets the application checkout to origin/main.
#   4. Removes stale pnpm node_modules and installs with npm.
#   5. Optionally recreates a GYDS node.
#   6. Runs deploy.sh for the web/API stack.
#   7. Runs check-services.sh.
#
# A node recreation creates a new chain. The old node data is moved to a
# timestamped backup directory and is not deleted.
#
# Examples:
#   sudo ./repair-redeploy.sh --domain example.com --node-type=main \
#     --recreate-node --yes
#   sudo ./repair-redeploy.sh --domain example.com --skip-node --yes
#   sudo ./repair-redeploy.sh --domain _ --no-web --skip-node --yes
# ============================================================

set -euo pipefail

APP_DIR="/var/www/gyds-explorer"
REPO_URL="https://github.com/hc172808/gyds-explorer.git"
NODE_VERSION_REQUIRED="22.18.0"
DOMAIN=""
NODE_TYPE="${NODE_TYPE:-main}"
RECREATE_NODE=false
SKIP_NODE=false
DEPLOY_WEB=true
ASSUME_YES=false

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
info() { echo -e "${CYAN}[ℹ]${NC} $1"; }
die()  { echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  sudo ./repair-redeploy.sh [options]

Options:
  --domain NAME          Domain name, or "_" to deploy without SSL
  --node-type TYPE       main, full, lite, rpc, or validator
  --recreate-node        Back up old node data and create a new chain
  --skip-node            Do not run node-setup.sh
  --no-web               Deploy API/database without Nginx/frontend
  --yes                  Confirm backups, Git reset, and node recreation
  --help                 Show this help

Recommended fresh MAIN deployment:
  sudo ./repair-redeploy.sh --domain example.com \
    --node-type=main --recreate-node --yes

This script never deletes old node data; it moves it to a timestamped backup.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --domain)
      die "--domain requires a value; use --domain=example.com"
      ;;
    --domain=*) DOMAIN="${arg#--domain=}" ;;
    --node-type=*) NODE_TYPE="${arg#--node-type=}" ;;
    --recreate-node) RECREATE_NODE=true ;;
    --skip-node) SKIP_NODE=true ;;
    --no-web) DEPLOY_WEB=false ;;
    --yes) ASSUME_YES=true ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: ${arg}. Use --help." ;;
  esac
done

[ "${EUID}" -eq 0 ] || die "Run as root: sudo ./repair-redeploy.sh ..."
[ -n "${DOMAIN}" ] || die "A domain is required. Use --domain=example.com or --domain=_"

case "${NODE_TYPE}" in
  main|full|lite|rpc|validator) ;;
  *) die "Invalid node type '${NODE_TYPE}'." ;;
esac

if [ "${RECREATE_NODE}" = true ] && [ "${SKIP_NODE}" = true ]; then
  die "--recreate-node and --skip-node cannot be used together."
fi

if [ "${RECREATE_NODE}" = true ] && [ "${ASSUME_YES}" = false ]; then
  echo ""
  warn "This will back up the existing node and create a new blockchain."
  warn "The old chain will no longer be used by the new node."
  read -r -p "Type RECREATE to continue: " confirmation
  [ "${confirmation}" = "RECREATE" ] || die "Cancelled."
fi

timestamp="$(date '+%Y%m%d-%H%M%S')"
backup_dir="/root/gyds-redeploy-backup-${timestamp}"
mkdir -p "${backup_dir}"

info "Stopping existing application services..."
systemctl stop gyds-node 2>/dev/null || true
systemctl stop nginx 2>/dev/null || true
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop all 2>/dev/null || true
fi

if [ -f "${APP_DIR}/.env" ]; then
  cp -a "${APP_DIR}/.env" "${backup_dir}/.env"
  log "Backed up .env to ${backup_dir}/.env"
fi

if [ "${RECREATE_NODE}" = true ]; then
  for path in /var/lib/gyds /etc/gyds /var/log/gyds; do
    if [ -e "${path}" ]; then
      mv "${path}" "${backup_dir}/$(basename "${path}")"
      log "Backed up ${path}"
    fi
  done
fi

if [ -d "${APP_DIR}/.git" ]; then
  cd "${APP_DIR}"
  info "Repairing Git checkout..."
  git merge --abort 2>/dev/null || true
  git rebase --abort 2>/dev/null || true
  git fetch origin
  git reset --hard origin/main
  log "Checkout reset to origin/main at $(git rev-parse --short HEAD)"
else
  if [ -e "${APP_DIR}" ]; then
    mv "${APP_DIR}" "${APP_DIR}.broken-${timestamp}"
  fi
  git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
  log "Repository cloned from ${REPO_URL}"
fi

info "Removing stale pnpm dependency directories..."
find "${APP_DIR}" -type d -name node_modules -prune -exec rm -rf {} +

command -v node >/dev/null 2>&1 || die "Node.js is not installed."
command -v npm >/dev/null 2>&1 || die "npm is not installed."

node_major="$(node -p 'process.versions.node.split(".")[0]')"
node_version="$(node --version | sed 's/^v//')"
if [ "${node_major}" -lt 22 ]; then
  die "Node.js ${node_version} is too old. Install Node.js 22.18.0 or newer, then rerun this script."
fi

npm config set registry https://registry.npmjs.org/
registry="$(npm config get registry)"
[ "${registry}" = "https://registry.npmjs.org/" ] || die "Unexpected npm registry: ${registry}"

version_at_least() {
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

if ! version_at_least "${node_version}" "${NODE_VERSION_REQUIRED}"; then
  info "Node.js ${node_version} is too old; installing Node.js 22..."
  apt-get update -y
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  node_version="$(node --version | sed 's/^v//')"
fi

version_at_least "${node_version}" "${NODE_VERSION_REQUIRED}" || \
  die "Node.js ${NODE_VERSION_REQUIRED} or newer is required; found v${node_version}."
log "Using Node.js ${node_version} and public npm registry"

npm ci --legacy-peer-deps || npm install --legacy-peer-deps
log "npm dependencies installed"

if [ "${SKIP_NODE}" = false ]; then
  if [ ! -x "${APP_DIR}/node-setup.sh" ]; then
    chmod +x "${APP_DIR}/node-setup.sh"
  fi
  info "Setting up ${NODE_TYPE^^} node..."
  if [ "${NODE_TYPE}" = "main" ]; then
    printf '\n' | NODE_TYPE="${NODE_TYPE}" bash "${APP_DIR}/node-setup.sh"
  else
    NODE_TYPE="${NODE_TYPE}" bash "${APP_DIR}/node-setup.sh"
  fi
else
  info "Skipping node setup (--skip-node)."
fi

deploy_args=()
[ "${DEPLOY_WEB}" = true ] || deploy_args+=("--no-web")
info "Deploying explorer and API services..."
if [ "${SKIP_NODE}" = false ]; then
  printf 'n\n' | bash "${APP_DIR}/deploy.sh" "${DOMAIN}" "${deploy_args[@]}"
else
  bash "${APP_DIR}/deploy.sh" "${DOMAIN}" "${deploy_args[@]}"
fi

if [ -x "${APP_DIR}/check-services.sh" ]; then
  info "Running service and port health checks..."
  "${APP_DIR}/check-services.sh" || warn "Health checks reported failures; inspect the output above."
else
  warn "check-services.sh is not present in this Git checkout."
  info "Use: sudo ss -ltnup"
fi

echo ""
log "Repair and redeploy finished."
echo "Backup directory: ${backup_dir}"
echo "Check node:       systemctl status gyds-node"
echo "Check web/API:    pm2 list && systemctl status nginx"
echo "Check ports:      ss -ltnup"