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
#   --scheduled    Internal mode: exit without updating unless enabled in Admin settings
# ============================================================

set -e

# ---------- Configuration ----------
APP_DIR="${APP_DIR:-/var/www/gyds-explorer}"
API_DIR="${APP_DIR}/api"
# The current Vite config writes the production build directly to the
# workspace-level dist directory.
FRONTEND_BUILD_DIR="${APP_DIR}/dist"
HEALTH_CHECK="${APP_DIR}/check-services.sh"
LOG_FILE="/var/log/gyds-explorer-update.log"
MIN_NODE_VERSION="22.18.0"
NPM_REGISTRY="https://registry.npmjs.org/"
WEB_PORT="${WEB_PORT:-}"
if [ -z "${WEB_PORT}" ] && [ -f "${APP_DIR}/.env" ]; then
  WEB_PORT="$(awk -F= '$1 == "WEB_PORT" {print $2; exit}' "${APP_DIR}/.env" 2>/dev/null || true)"
fi
WEB_PORT="${WEB_PORT:-8080}"

# ---------- Flags ----------
SKIP_DEPS=false
SKIP_BUILD=false
NO_RESTART=false
BRANCH=""
SCHEDULED=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-deps)   SKIP_DEPS=true; shift ;;
    --skip-build)  SKIP_BUILD=true; shift ;;
    --no-restart)  NO_RESTART=true; shift ;;
    --scheduled)   SCHEDULED=true; shift ;;
    --branch)
      [ "$#" -ge 2 ] || { printf '%s\n' "--branch requires a branch name" >&2; exit 2; }
      BRANCH="$2"
      shift 2
      ;;
    --branch=*)
      BRANCH="${1#--branch=}"
      shift
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 2
      ;;
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

read_env_value() {
  local key="$1"
  [ -f "${APP_DIR}/.env" ] || return 0
  awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "${APP_DIR}/.env"
}

database_psql() {
  local db_host db_port db_name db_user db_password
  db_host="${DB_HOST:-$(read_env_value DB_HOST)}"
  db_port="${DB_PORT:-$(read_env_value DB_PORT)}"
  db_name="${DB_NAME:-$(read_env_value DB_NAME)}"
  db_user="${DB_USER:-$(read_env_value DB_USER)}"
  db_password="${DB_PASSWORD:-$(read_env_value DB_PASSWORD)}"
  db_host="${db_host:-localhost}"
  db_port="${db_port:-5432}"
  db_name="${db_name:-gyds_explorer}"
  db_user="${db_user:-gyds_admin}"
  [ -n "${db_password}" ] || err "Database password is missing; cannot manage automatic updates."
  command -v psql >/dev/null 2>&1 || err "psql is required to manage update settings on this Ubuntu server."
  PGPASSWORD="${db_password}" psql -X -v ON_ERROR_STOP=1 \
    -h "${db_host}" -p "${db_port}" -U "${db_user}" -d "${db_name}" "$@"
}

database_query() {
  database_psql -Atq -c "$1"
}

if [ "${SCHEDULED}" = true ]; then
  AUTO_UPDATE_ENABLED="$(database_query "SELECT COALESCE((SELECT lower(value) IN ('true','1','yes','on') FROM system_settings WHERE key = 'auto_update_enabled'), false);")" \
    || err "Could not read the automatic update setting. Skipping this scheduled run."
  if [ "${AUTO_UPDATE_ENABLED}" != "t" ]; then
    info "Automatic updates are disabled; scheduled run skipped."
    exit 0
  fi
fi

if ! [[ "${WEB_PORT}" =~ ^[0-9]+$ ]] || [ "${WEB_PORT}" -lt 1 ] || [ "${WEB_PORT}" -gt 65535 ]; then
  err "WEB_PORT must be a TCP port between 1 and 65535; found '${WEB_PORT}'."
fi

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

if ! git remote get-url origin >/dev/null 2>&1; then
  err "No Git remote named 'origin' is configured in ${APP_DIR}."
fi

git fetch --prune origin

TARGET_BRANCH="${BRANCH:-${CURRENT_BRANCH}}"
if [ "${TARGET_BRANCH}" = "HEAD" ] || [ "${TARGET_BRANCH}" = "unknown" ]; then
  TARGET_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
fi
[ -n "${TARGET_BRANCH}" ] || err "Could not determine the Git branch to update."

if ! git show-ref --verify --quiet "refs/remotes/origin/${TARGET_BRANCH}"; then
  err "Remote branch origin/${TARGET_BRANCH} does not exist."
fi

if [ "${CURRENT_BRANCH}" != "${TARGET_BRANCH}" ]; then
  info "Switching to branch '${TARGET_BRANCH}'..."
  if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
    git checkout "${TARGET_BRANCH}"
  else
    git checkout -b "${TARGET_BRANCH}" "origin/${TARGET_BRANCH}"
  fi
fi

# Never stash deployment changes during an unattended or manual update.
if ! git diff --quiet HEAD || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  err "The Git checkout has local changes. Commit or move them before updating; this script will not stash or overwrite them."
fi

PULL_OUTPUT=$(git pull --ff-only origin "${TARGET_BRANCH}" 2>&1)
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
# STEP 3b: Apply additive update-scheduler database schema
# ============================================================
log "Ensuring automatic update settings table exists..."
DATABASE_MIGRATION="${APP_DIR}/scripts/sql/auto-update-settings.sql"
[ -f "${DATABASE_MIGRATION}" ] || err "Missing database migration: ${DATABASE_MIGRATION}"
database_psql -f "${DATABASE_MIGRATION}" \
  || err "Could not create the automatic update settings table."

# Existing deployments generated server.js before this route existed. Hook the
# protected endpoints into that server without overwriting its other routes.
if [ -f "${API_DIR}/server.js" ]; then
  node "${APP_DIR}/scripts/install-legacy-auto-update-hook.mjs" "${API_DIR}/server.js"
fi

# ============================================================
# STEP 4: Build frontend and API
# ============================================================
if [ "${SKIP_BUILD}" = "false" ]; then
  log "Building frontend..."
  cd "${APP_DIR}"
  PORT="${WEB_PORT}" BASE_PATH=/ NODE_ENV=production \
    npm run build --workspace=@workspace/solana-explorer

  if [ ! -f "${FRONTEND_BUILD_DIR}/index.html" ]; then
    err "Build failed — frontend index.html not found in ${FRONTEND_BUILD_DIR}."
  fi
  chmod 755 "${APP_DIR}/dist" "${APP_DIR}" /var/www 2>/dev/null || true
  if id -u www-data >/dev/null 2>&1; then
    chown -R www-data:www-data "${APP_DIR}/dist"
  fi
  find "${APP_DIR}/dist" -type d -exec chmod 755 {} \;
  find "${APP_DIR}/dist" -type f -exec chmod 644 {} \;
  log "Frontend built successfully → ${APP_DIR}/dist"

  log "Building API server..."
  npm run build --workspace=@workspace/api-server
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
    if nginx -t 2>/dev/null; then
      if systemctl is-active --quiet nginx; then
        systemctl reload nginx && log "Nginx reloaded." \
          || warn "Nginx reload failed. Check: systemctl status nginx"
      else
        systemctl start nginx && log "Nginx started." \
          || warn "Nginx could not start. Check: systemctl status nginx"
      fi
    else
      warn "Nginx config test failed — not reloaded. Check: nginx -t"
    fi
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

# Install or refresh the timer on a manual update. Scheduled runs leave the
# existing timer alone; the database flag decides whether it performs work.
if [ "${SCHEDULED}" = false ] && [ -f "${APP_DIR}/scripts/install-auto-update.sh" ]; then
  APP_DIR="${APP_DIR}" bash "${APP_DIR}/scripts/install-auto-update.sh" \
    || warn "Could not install the monthly systemd timer. Run scripts/install-auto-update.sh manually."
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
