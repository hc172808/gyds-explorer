#!/bin/bash
# ============================================================
# GYDS Explorer — Update Script
# ============================================================
# Pulls latest code from git, installs any new dependencies,
# rebuilds the frontend, and restarts all services.
#
# Usage:
#   chmod +x update.sh
#   sudo ./update.sh [--skip-deps] [--skip-build] [--branch main]
#
# Options:
#   --skip-deps    Skip npm install (use when only frontend changed)
#   --skip-build   Skip frontend build (use when only API changed)
#   --branch NAME  Pull a specific branch (default: current branch)
#   --no-restart   Pull and build only, do not restart services
# ============================================================

set -e

# ---------- Configuration ----------
APP_DIR="/var/www/gyds-explorer"
API_DIR="${APP_DIR}/api"
LOG_FILE="/var/log/gyds-explorer-update.log"

# ---------- Flags ----------
SKIP_DEPS=false
SKIP_BUILD=false
NO_RESTART=false
BRANCH=""

for arg in "$@"; do
  case "$arg" in
    --skip-deps)   SKIP_DEPS=true ;;
    --skip-build)  SKIP_BUILD=true ;;
    --no-restart)  NO_RESTART=true ;;
    --branch)      shift; BRANCH="$1" ;;
    --branch=*)    BRANCH="${arg#--branch=}" ;;
  esac
done

# ---------- Colors ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [✓] $1"; echo -e "${GREEN}${msg}${NC}"; echo "$msg" >> "${LOG_FILE}" 2>/dev/null || true; }
warn() { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [⚠] $1"; echo -e "${YELLOW}${msg}${NC}"; echo "$msg" >> "${LOG_FILE}" 2>/dev/null || true; }
err()  { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [✗] $1"; echo -e "${RED}${msg}${NC}";    echo "$msg" >> "${LOG_FILE}" 2>/dev/null || true; exit 1; }
info() { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [ℹ] $1"; echo -e "${CYAN}${msg}${NC}";  echo "$msg" >> "${LOG_FILE}" 2>/dev/null || true; }

# ---------- Pre-flight ----------
if [ "$EUID" -ne 0 ]; then
  err "Please run as root: sudo ./update.sh"
fi

if [ ! -d "${APP_DIR}/.git" ]; then
  err "No git repository found at ${APP_DIR}. Run deploy.sh first."
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   GYDS Explorer — Update Script              ║"
echo "║   $(date '+%Y-%m-%d %H:%M:%S')                         ║"
echo "╠══════════════════════════════════════════════╣"
printf "║   App dir:     %-29s║\n" "${APP_DIR}"
printf "║   Skip deps:   %-29s║\n" "${SKIP_DEPS}"
printf "║   Skip build:  %-29s║\n" "${SKIP_BUILD}"
printf "║   Branch:      %-29s║\n" "${BRANCH:-current}"
echo "╚══════════════════════════════════════════════╝"
echo ""

cd "${APP_DIR}"

# ============================================================
# STEP 1: Snapshot current state
# ============================================================
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
info "Current commit: ${CURRENT_COMMIT} on branch '${CURRENT_BRANCH}'"

# ============================================================
# STEP 2: Git pull
# ============================================================
log "Pulling latest code from git..."

if [ -n "${BRANCH}" ] && [ "${BRANCH}" != "${CURRENT_BRANCH}" ]; then
  info "Switching to branch '${BRANCH}'..."
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
fi

git fetch origin

# Check if there are local uncommitted changes
if ! git diff --quiet HEAD; then
  warn "You have local uncommitted changes. Stashing them before pulling..."
  git stash push -m "auto-stash before update $(date '+%Y%m%d-%H%M%S')"
  STASHED=true
else
  STASHED=false
fi

PULL_OUTPUT=$(git pull origin "${BRANCH:-${CURRENT_BRANCH}}" 2>&1)
echo "$PULL_OUTPUT"

NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

if [ "${CURRENT_COMMIT}" = "${NEW_COMMIT}" ]; then
  warn "Already up to date (commit: ${CURRENT_COMMIT}). No changes pulled."
  # Still continue — deps or services may need updating
else
  log "Updated: ${CURRENT_COMMIT} → ${NEW_COMMIT}"
fi

# Show what changed
if [ "${CURRENT_COMMIT}" != "${NEW_COMMIT}" ]; then
  info "Changes in this update:"
  git log --oneline "${CURRENT_COMMIT}..${NEW_COMMIT}" 2>/dev/null || true
fi

# Restore stash if we stashed
if [ "${STASHED}" = "true" ]; then
  warn "Restoring your local changes from stash..."
  git stash pop || warn "Stash pop failed — check 'git stash list' and resolve manually."
fi

# ============================================================
# STEP 3: Install / update dependencies
# ============================================================
if [ "${SKIP_DEPS}" = "false" ]; then
  log "Installing/updating frontend dependencies..."
  npm install --legacy-peer-deps

  if [ -d "${API_DIR}" ]; then
    log "Installing/updating API dependencies..."
    cd "${API_DIR}"
    npm install --legacy-peer-deps
    cd "${APP_DIR}"
  fi

  if [ -d "${APP_DIR}/indexer" ]; then
    log "Installing/updating indexer dependencies..."
    cd "${APP_DIR}/indexer"
    npm install --legacy-peer-deps
    cd "${APP_DIR}"
  fi

  if [ -d "${APP_DIR}/feature-gate-service" ]; then
    log "Installing/updating feature-gate-service dependencies..."
    cd "${APP_DIR}/feature-gate-service"
    npm install --legacy-peer-deps
    cd "${APP_DIR}"
  fi
else
  info "Skipping dependency install (--skip-deps)."
fi

# ============================================================
# STEP 4: Build frontend
# ============================================================
if [ "${SKIP_BUILD}" = "false" ]; then
  log "Building frontend..."
  cd "${APP_DIR}"
  npm run build

  if [ ! -d "${APP_DIR}/dist" ]; then
    err "Build failed — 'dist' directory not found."
  fi
  log "Frontend built successfully → ${APP_DIR}/dist"
else
  info "Skipping frontend build (--skip-build)."
fi

# ============================================================
# STEP 5: Restart services
# ============================================================
if [ "${NO_RESTART}" = "false" ]; then
  log "Restarting services..."

  # PM2 services (API, indexer, feature-gate)
  if command -v pm2 &>/dev/null; then
    PM2_SERVICES=()
    pm2 describe gyds-api       &>/dev/null && PM2_SERVICES+=("gyds-api")
    pm2 describe gyds-indexer   &>/dev/null && PM2_SERVICES+=("gyds-indexer")
    pm2 describe gyds-feature-gates &>/dev/null && PM2_SERVICES+=("gyds-feature-gates")

    if [ ${#PM2_SERVICES[@]} -gt 0 ]; then
      for svc in "${PM2_SERVICES[@]}"; do
        pm2 restart "${svc}" && info "PM2: ${svc} restarted." || warn "PM2: failed to restart ${svc}."
      done
      pm2 save
    else
      warn "No PM2 services found (gyds-api / gyds-indexer). They may not be running yet."
    fi
  else
    warn "PM2 not found. Install it with: npm install -g pm2"
  fi

  # Reload nginx (no downtime)
  if command -v nginx &>/dev/null; then
    nginx -t 2>/dev/null && systemctl reload nginx && log "Nginx reloaded." \
      || warn "Nginx config test failed — not reloaded. Check: nginx -t"
  fi
else
  info "Skipping service restart (--no-restart)."
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ Update complete!                        ║"
echo "╠══════════════════════════════════════════════╣"
printf "║   Was:  %-36s║\n" "${CURRENT_COMMIT} (${CURRENT_BRANCH})"
printf "║   Now:  %-36s║\n" "${NEW_COMMIT}"
echo "║                                              ║"
echo "║   Useful commands:                           ║"
echo "║   pm2 logs gyds-api     — API logs           ║"
echo "║   pm2 logs gyds-indexer — Indexer logs       ║"
echo "║   pm2 list              — All service status ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
info "Full update log saved to: ${LOG_FILE}"
