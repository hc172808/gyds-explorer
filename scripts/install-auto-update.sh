#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
UNIT_DIR="/etc/systemd/system"

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/install-auto-update.sh" >&2
  exit 1
fi
if ! command -v systemctl >/dev/null 2>&1 || [ ! -d /run/systemd/system ]; then
  echo "systemd is not running here; monthly updates are available on the Ubuntu deployment server."
  exit 0
fi
if [ ! -x "${APP_DIR}/update.sh" ] && [ ! -f "${APP_DIR}/update.sh" ]; then
  echo "Update script not found at ${APP_DIR}/update.sh" >&2
  exit 1
fi

cat > "${UNIT_DIR}/gyds-explorer-auto-update.service" <<EOF
[Unit]
Description=Pull, build, and restart the GYDS Explorer
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
Environment=APP_DIR=${APP_DIR}
WorkingDirectory=${APP_DIR}
ExecStart=/bin/bash ${APP_DIR}/update.sh --scheduled
EOF

cat > "${UNIT_DIR}/gyds-explorer-auto-update.timer" <<'EOF'
[Unit]
Description=Run GYDS Explorer updates monthly

[Timer]
OnCalendar=*-*-15 03:00:00 America/Guyana
Persistent=true
AccuracySec=1min
Unit=gyds-explorer-auto-update.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now gyds-explorer-auto-update.timer
echo "Installed monthly timer: day 15 at 03:00 America/Guyana time."
systemctl list-timers gyds-explorer-auto-update.timer --no-pager
