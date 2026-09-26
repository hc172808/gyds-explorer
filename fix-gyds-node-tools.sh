#!/usr/bin/env bash
# ============================================================
# GYDS Node Tools Repair
# ============================================================
# Repairs gyds-enode, gyds-peers, and gyds-console after an older
# installation incorrectly used HTTP RPC for the admin namespace.
#
# Usage:
#   sudo ./fix-gyds-node-tools.sh
#   sudo ./fix-gyds-node-tools.sh --no-restart
#
# This script does not delete chain data, regenerate genesis.json,
# change firewall rules, or expose the admin namespace publicly.
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

NO_RESTART=false

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
info() { echo -e "${CYAN}[ℹ]${NC} $1"; }
die()  { echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage: sudo ./fix-gyds-node-tools.sh [--no-restart]

Repairs:
  /usr/local/bin/gyds-enode
  /usr/local/bin/gyds-peers
  /usr/local/bin/gyds-console

The commands use the local Geth IPC socket, which is required for
the admin namespace. No blockchain data or genesis files are changed.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --no-restart) NO_RESTART=true ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: ${arg}. Use --help." ;;
  esac
done

[ "${EUID}" -eq 0 ] || die "Run as root: sudo ./fix-gyds-node-tools.sh"
[ -f /etc/gyds/node.env ] || die "/etc/gyds/node.env was not found. The GYDS node is not configured."
command -v geth >/dev/null 2>&1 || die "geth is not installed or is not in PATH."

# Read only the node data directory from the generated environment file.
DATA_DIR="$(awk -F= '$1 == "DATA_DIR" {print $2; exit}' /etc/gyds/node.env)"
DATA_DIR="${DATA_DIR:-/var/lib/gyds}"
IPC_PATH="${DATA_DIR}/geth.ipc"

install_tool() {
  local path="$1"
  local body="$2"
  printf '%s\n' "${body}" > "${path}"
  chmod 0755 "${path}"
  chown root:root "${path}"
}

install_tool /usr/local/bin/gyds-console '#!/usr/bin/env bash
set -euo pipefail
source /etc/gyds/node.env
IPC_PATH="${DATA_DIR:-/var/lib/gyds}/geth.ipc"
[ -S "${IPC_PATH}" ] || {
  echo "Geth IPC socket not found: ${IPC_PATH}" >&2
  echo "Check: sudo systemctl status gyds-node" >&2
  exit 1
}
exec geth attach "${IPC_PATH}"'

install_tool /usr/local/bin/gyds-enode '#!/usr/bin/env bash
set -euo pipefail
source /etc/gyds/node.env
IPC_PATH="${DATA_DIR:-/var/lib/gyds}/geth.ipc"
[ -S "${IPC_PATH}" ] || {
  echo "Geth IPC socket not found: ${IPC_PATH}" >&2
  echo "Check: sudo systemctl status gyds-node" >&2
  exit 1
}
exec geth attach --exec "admin.nodeInfo.enode" "${IPC_PATH}"'

install_tool /usr/local/bin/gyds-peers '#!/usr/bin/env bash
set -euo pipefail
source /etc/gyds/node.env
IPC_PATH="${DATA_DIR:-/var/lib/gyds}/geth.ipc"
[ -S "${IPC_PATH}" ] || {
  echo "Geth IPC socket not found: ${IPC_PATH}" >&2
  echo "Check: sudo systemctl status gyds-node" >&2
  exit 1
}
exec geth attach --exec "admin.peers.length" "${IPC_PATH}"'

log "Installed IPC-based GYDS management commands."

if [ "${NO_RESTART}" = false ]; then
  if systemctl restart gyds-node; then
    log "gyds-node restarted."
  else
    warn "gyds-node could not be restarted."
    warn "Inspect with: sudo journalctl -u gyds-node -n 100 --no-pager"
  fi
else
  info "Skipped node restart (--no-restart)."
fi

if [ -S "${IPC_PATH}" ]; then
  log "Geth IPC socket found: ${IPC_PATH}"
  echo ""
  echo "Enode:"
  /usr/local/bin/gyds-enode || true
  echo ""
  echo "Peers:"
  /usr/local/bin/gyds-peers || true
else
  warn "Geth IPC socket is not available yet: ${IPC_PATH}"
  warn "Check the node with: sudo systemctl status gyds-node"
  warn "View logs with: sudo journalctl -u gyds-node -n 100 --no-pager"
fi