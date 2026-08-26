#!/bin/bash
# ============================================================
# GYDS Explorer — Service and Port Health Check
# ============================================================
# Run on the server:
#   sudo bash check-services.sh
#
# This checks local listeners and local HTTP/RPC responses.
# A successful local check does not replace testing the cloud
# provider firewall from another machine.
# ============================================================

set -u

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
FAILURES=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_PORT="${WEB_PORT:-}"
if [ -z "${WEB_PORT}" ] && [ -f "${SCRIPT_DIR}/.env" ]; then
  WEB_PORT="$(awk -F= '$1 == "WEB_PORT" {print $2; exit}' "${SCRIPT_DIR}/.env" 2>/dev/null || true)"
fi
WEB_PORT="${WEB_PORT:-8080}"

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
warn() { echo -e "${YELLOW}[SKIP]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

listener() {
  local port="$1"
  ss -H -ltn "( sport = :${port} )" 2>/dev/null | grep -q .
}

udp_listener() {
  local port="$1"
  ss -H -lun "( sport = :${port} )" 2>/dev/null | grep -q .
}

check_tcp() {
  local label="$1"
  local port="$2"
  if listener "${port}"; then
    pass "${label}: TCP ${port} is listening"
  else
    fail "${label}: TCP ${port} is not listening"
  fi
}

check_http() {
  local label="$1"
  local url="$2"
  if curl -fsS --max-time 5 "${url}" >/dev/null 2>&1; then
    pass "${label}: ${url} responded"
  else
    fail "${label}: ${url} did not respond"
  fi
}

echo ""
echo "GYDS service and port health check"
echo "Host: $(hostname)"
echo ""

if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet nginx 2>/dev/null && pass "Nginx is active" || warn "Nginx is not active"
  systemctl is-active --quiet postgresql 2>/dev/null && pass "PostgreSQL is active" || warn "PostgreSQL is not active"
fi

if command -v pm2 >/dev/null 2>&1 && pm2 describe gyds-api >/dev/null 2>&1; then
  pm2 describe gyds-api 2>/dev/null | grep -q "online" && pass "PM2 gyds-api is online" || fail "PM2 gyds-api is not online"
elif listener 3001; then
  pass "API: TCP 3001 is listening"
else
  warn "API: no PM2 gyds-api process or TCP 3001 listener detected"
fi

if [ -f /etc/gyds/node.env ] || systemctl is-enabled --quiet gyds-node 2>/dev/null; then
  systemctl is-active --quiet gyds-node 2>/dev/null && pass "gyds-node is active" || fail "gyds-node is not active"
  check_tcp "Node P2P" 30303
  if udp_listener 30303; then
    pass "Node P2P: UDP 30303 is listening"
  else
    fail "Node P2P: UDP 30303 is not listening"
  fi

  NODE_TYPE=""
  [ -f /etc/gyds/node.env ] && NODE_TYPE="$(awk -F= '$1 == "NODE_TYPE" {print $2}' /etc/gyds/node.env)"
  case "${NODE_TYPE}" in
    main|full|lite|rpc)
      check_tcp "HTTP RPC" 8545
      check_tcp "WebSocket RPC" 8546
      if listener 8545; then
        if curl -sS --max-time 5 -H 'Content-Type: application/json' \
          --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
          http://127.0.0.1:8545 | grep -q '"result"'; then
          pass "HTTP RPC responded to eth_chainId"
        else
          fail "HTTP RPC did not return a valid eth_chainId response"
        fi
      fi
      ;;
    validator)
      info "Validator RPC is intentionally restricted to localhost"
      ;;
    *)
      warn "Node type is not set in /etc/gyds/node.env; checked P2P only"
      ;;
  esac
else
  warn "gyds-node is not configured on this server"
fi

if listener 80; then
  check_http "HTTP website" "http://127.0.0.1/"
else
  warn "TCP 80 is not listening (web deployment may be disabled)"
fi

if [ "${WEB_PORT}" != "80" ]; then
  if listener "${WEB_PORT}"; then
    check_http "Direct web port" "http://127.0.0.1:${WEB_PORT}/"
  else
    warn "TCP ${WEB_PORT} is not listening (check WEB_PORT/Nginx configuration)"
  fi
fi

if listener 443; then
  if curl -kfsS --max-time 5 https://127.0.0.1/ >/dev/null 2>&1; then
    pass "HTTPS website: https://127.0.0.1/ responded"
  else
    fail "HTTPS port 443 is listening but HTTPS did not respond"
  fi
else
  warn "TCP 443 is not listening (SSL may not be configured yet)"
fi

echo ""
echo "Listening sockets:"
ss -ltnup 2>/dev/null | grep -E ":(${WEB_PORT}|22|80|443|3001|3002|30303|5432|6060|8008|8545|8546)\\b" || true
echo ""

if [ "${FAILURES}" -gt 0 ]; then
  echo -e "${RED}${FAILURES} health check(s) failed.${NC}"
  exit 1
fi

echo -e "${GREEN}All configured services passed their local checks.${NC}"
echo "From another machine, also test the server firewall with:"
echo "  nc -vz YOUR_SERVER_IP 80"
echo "  nc -vz YOUR_SERVER_IP ${WEB_PORT}   # direct web port"
echo "  nc -vz YOUR_SERVER_IP 443"
echo "  nc -vz YOUR_SERVER_IP 30303"
echo "  nc -vz YOUR_SERVER_IP 8545   # public RPC nodes only"
echo "  nc -vz YOUR_SERVER_IP 8546   # public RPC nodes only"