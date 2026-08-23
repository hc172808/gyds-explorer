#!/bin/bash
# ============================================================
# GYDS Explorer — Update Script
# ============================================================
# Pulls latest code from git, installs any new dependencies,
# rebuilds the frontend, restarts all services, and checks health.
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
FRONTEND_BUILD_DIR="${APP_DIR}/artifacts/solana-explorer/dist/public"
HEALTH_CHECK="${APP_DIR}/check-services.sh"
LOG_FILE="/var/log/gyds-explorer-update.log"
MIN_NODE_VERSION="22.18.0"
NPM_REGISTRY="https://registry.npmjs.org/"

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

version_at_least() {
  local current="$1"
  local minimum="$2"
  local current_major current_minor current_patch
  local minimum_major minimum_minor minimum_patch
  IFS=. read -r current_major current_minor current_patch <<< "${current%%-*}"
  IFS=. read -r minimum_major minimum_minor minimum_patch <<< "${minimum%%-*}"
  current_minor="${current_minor:-0}"
  current_patch="${current_patch:-0}"
  minimum_minor="${minimum_minor:-0}"
  minimum_patch="${minimum_patch:-0}"
  if [ "${current_major:-0}" -ne "${minimum_major:-0}" ]; then
    [ "${current_major:-0}" -gt "${minimum_major:-0}" ]
  elif [ "${current_minor:-0}" -ne "${minimum_minor:-0}" ]; then
    [ "${current_minor:-0}" -gt "${minimum_minor:-0}" ]
  else
    [ "${current_patch:-0}" -ge "${minimum_patch:-0}" ]
  fi
}

check_node_version() {
  command -v node >/dev/null 2>&1 || err "Node.js ${MIN_NODE_VERSION} or newer is required."
  local current_node
  current_node="$(node -v | sed 's/^v//')"
  version_at_least "${current_node}" "${MIN_NODE_VERSION}" || \
    err "Node.js ${MIN_NODE_VERSION} or newer is required; found v${current_node}."
  command -v npm >/dev/null 2>&1 || err "npm is required."
}

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
check_node_version
export npm_config_registry="${NPM_REGISTRY}"
if [ "$(npm config get registry)" != "${NPM_REGISTRY}" ]; then
  err "npm registry must be ${NPM_REGISTRY}; found $(npm config get registry)."
fi

# Never attempt to stash or pull while Git has unresolved merge entries.
# This commonly happens when the repository was migrated away from pnpm
# while an older update was already in progress.
if git ls-files -u | grep -q .; then
  err "Git has unresolved merge conflicts. Resolve them first with 'git merge --abort' or, if this server must exactly match origin, 'git fetch origin && git reset --hard origin/main'."
fi

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
  if ! git stash pop; then
    err "Stash restore caused conflicts. Resolve them, then rerun the update."
  fi
fi

# ============================================================
# STEP 3: Install / update dependencies
# ============================================================
if [ "${SKIP_DEPS}" = "false" ]; then
  log "Installing/updating workspace dependencies..."
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
  PORT=8080 BASE_PATH=/ NODE_ENV=production \
    npm run build --workspace=@workspace/solana-explorer

  if [ ! -d "${FRONTEND_BUILD_DIR}" ]; then
    err "Build failed — frontend output not found in ${FRONTEND_BUILD_DIR}."
  fi
  rm -rf "${APP_DIR}/dist"
  cp -R "${FRONTEND_BUILD_DIR}" "${APP_DIR}/dist"
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

  if [ -x "${HEALTH_CHECK}" ]; then
    log "Running service and port health check..."
    "${HEALTH_CHECK}" || warn "Health check reported failures. Review the output above."
  else
    warn "Health checker not found at ${HEALTH_CHECK}."
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
