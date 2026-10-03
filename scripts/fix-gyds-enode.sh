#!/usr/bin/env bash
set -Eeuo pipefail

# Installs the project-compatible Geth build when --mine is unavailable, either
# before first-time node setup or on an existing MAIN/validator service.
# It never resets or edits chain data.

SERVICE="gyds-node"
CONFIG_FILE="/etc/gyds/node.env"
BACKUP_DIR="/var/backups/gyds"
GETH_VERSION="1.13.15-c5ba367e"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR=""
STAGED_GETH=""

cleanup() {
  if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf -- "${TMP_DIR}"
  fi
  if [ -n "${STAGED_GETH}" ] && [ -e "${STAGED_GETH}" ]; then
    rm -f -- "${STAGED_GETH}"
  fi
}
trap cleanup EXIT

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

has_mine_flag() {
  local help_output
  help_output="$("$1" --help 2>&1 || true)"
  [[ "${help_output}" =~ (^|[[:space:]])--mine([[:space:]]|$) ]]
}

if [ "${EUID}" -ne 0 ]; then
  fail "Run this repair as root: sudo bash scripts/fix-gyds-enode.sh"
fi

command -v systemctl >/dev/null || fail "systemctl is not available."
command -v journalctl >/dev/null || fail "journalctl is not available."
if systemctl cat "${SERVICE}" >/dev/null 2>&1; then
  SERVICE_CONFIGURED=yes
else
  SERVICE_CONFIGURED=no
fi

# Existing installations use this root-owned config to find the data directory.
# On a fresh installation, stage Geth first; node-setup.sh will create the unit.
if [ -r "${CONFIG_FILE}" ]; then
  source "${CONFIG_FILE}"
  DATA_DIR="${DATA_DIR:-/var/lib/gyds}"
elif [ "${SERVICE_CONFIGURED}" = "yes" ]; then
  fail "Systemd unit ${SERVICE} exists but ${CONFIG_FILE} is missing; refusing to modify the node binary."
else
  DATA_DIR="/var/lib/gyds"
fi
IPC_PATH="${DATA_DIR}/geth.ipc"

GETH_BIN=""
if [ "${SERVICE_CONFIGURED}" = "yes" ]; then
  GETH_BIN="$(systemctl show -p ExecStart --value "${SERVICE}" |
    sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n 1)"
fi
if [ -z "${GETH_BIN}" ]; then
  GETH_BIN="$(command -v geth || true)"
fi
[ -n "${GETH_BIN}" ] && [ -x "${GETH_BIN}" ] ||
  fail "Could not locate an installed Geth executable."

echo "Node data directory: ${DATA_DIR}"
echo "Geth executable:     ${GETH_BIN}"
INSTALLED_VERSION="$("${GETH_BIN}" version 2>/dev/null | sed -n '1,2p' | tr '\n' ' ' || true)"
echo "Installed version:   ${INSTALLED_VERSION:-unknown}"

if [ "${SERVICE_CONFIGURED}" = "no" ] && has_mine_flag "${GETH_BIN}"; then
  echo "This Geth build supports --mine, but no ${SERVICE} systemd unit exists yet."
  echo "Rerun node-setup.sh or deploy.sh to complete the node setup."
  exit 0
fi

if ! has_mine_flag "${GETH_BIN}"; then
  echo
  echo "The installed Geth does not support --mine, required by MAIN and validator nodes."

  ARCH="$(dpkg --print-architecture)"
  case "${ARCH}" in
    amd64|arm64) GETH_ARCH="${ARCH}" ;;
    *) fail "Unsupported server architecture for the pinned Geth build: ${ARCH}" ;;
  esac

  ARCHIVE_NAME="geth-linux-${GETH_ARCH}-${GETH_VERSION}.tar.gz"
  DOWNLOAD_URL="https://gethstore.blob.core.windows.net/builds/${ARCHIVE_NAME}"
  TMP_DIR="$(mktemp -d)"

  echo "Downloading the project-pinned Geth ${GETH_VERSION} build..."
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error "${DOWNLOAD_URL}" \
      --output "${TMP_DIR}/${ARCHIVE_NAME}"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet "${DOWNLOAD_URL}" --output-document="${TMP_DIR}/${ARCHIVE_NAME}"
  else
    fail "Install curl or wget, then rerun this script."
  fi

  tar -xzf "${TMP_DIR}/${ARCHIVE_NAME}" -C "${TMP_DIR}"
  DOWNLOADED_GETH="${TMP_DIR}/geth-linux-${GETH_ARCH}-${GETH_VERSION}/geth"
  [ -x "${DOWNLOADED_GETH}" ] || fail "The downloaded archive did not contain an executable Geth binary."
  if ! has_mine_flag "${DOWNLOADED_GETH}"; then
    DOWNLOADED_VERSION="$("${DOWNLOADED_GETH}" version 2>&1 | head -n 2 || true)"
    echo "Downloaded binary version: ${DOWNLOADED_VERSION:-unavailable}" >&2
    echo "Geth help output mentioning mining:" >&2
    "${DOWNLOADED_GETH}" --help 2>&1 | grep -i -C 2 'mine' >&2 || true
    fail "The downloaded Geth build does not support --mine; refusing to replace the installed binary."
  fi

  BACKUP_PATH="${BACKUP_DIR}/geth-before-enode-fix-$(date -u +%Y%m%dT%H%M%SZ)"
  STAGED_GETH="${GETH_BIN}.gyds-new.$$"
  install -o root -g root -m 0755 "${DOWNLOADED_GETH}" "${STAGED_GETH}"
  has_mine_flag "${STAGED_GETH}" || {
    rm -f -- "${STAGED_GETH}"
    fail "Staged Geth build did not pass validation; the installed binary was not changed."
  }

  echo
  echo "This will replace only ${GETH_BIN}."
  echo "The current executable will be saved as ${BACKUP_PATH}."
  echo "It will not change PostgreSQL, /var/lib/gyds, the genesis file, or keystore."
  if [ "${SERVICE_CONFIGURED}" = "yes" ]; then
    read -r -p "Install this Geth build and restart ${SERVICE}? [y/N] " CONFIRM
  else
    read -r -p "Install this Geth build for a fresh node setup? [y/N] " CONFIRM
  fi
  [[ "${CONFIRM}" =~ ^[Yy]$ ]] || {
    rm -f -- "${STAGED_GETH}"
    echo "Cancelled. No service or installed binary was changed."
    exit 0
  }

  install -d -o root -g root -m 0750 "${BACKUP_DIR}"
  cp -a -- "${GETH_BIN}" "${BACKUP_PATH}"
  if [ "${SERVICE_CONFIGURED}" = "yes" ]; then
    systemctl stop "${SERVICE}" ||
      fail "Could not stop ${SERVICE}; the installed Geth binary was not replaced."
  fi
  mv -f -- "${STAGED_GETH}" "${GETH_BIN}"
  STAGED_GETH=""

  echo "Installed Geth ${GETH_VERSION}; backup: ${BACKUP_PATH}"
fi

if [ "${SERVICE_CONFIGURED}" = "no" ]; then
  echo "Compatible Geth is ready. No node service was configured or started."
  echo "Rerun node-setup.sh or deploy.sh to complete the node setup."
  exit 0
fi

# Refresh the command itself when this script is run from the project checkout.
if [ -f "${SCRIPT_DIR}/gyds-enode" ]; then
  install -o root -g root -m 0755 \
    "${SCRIPT_DIR}/gyds-enode" /usr/local/bin/gyds-enode
fi

systemctl reset-failed "${SERVICE}" || true
systemctl start "${SERVICE}" || true

READY=0
for _ in $(seq 1 30); do
  if systemctl is-active --quiet "${SERVICE}" && [ -S "${IPC_PATH}" ]; then
    READY=1
    break
  fi
  sleep 1
done

if [ "${READY}" -ne 1 ]; then
  echo "GYDS node did not become ready. Recent service status and logs:" >&2
  systemctl --no-pager --full status "${SERVICE}" >&2 || true
  journalctl -u "${SERVICE}" -n 60 --no-pager >&2 || true
  fail "Node startup failed. Chain data and keystore were left untouched."
fi

ENODE="$("${GETH_BIN}" attach --exec 'admin.nodeInfo.enode' "${IPC_PATH}")" ||
  fail "Node is running, but Geth could not return its enode over IPC."
[ -n "${ENODE}" ] || fail "Geth returned an empty enode URL."

echo
echo "GYDS node is running."
echo "Enode URL: ${ENODE}"