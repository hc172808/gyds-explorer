#!/usr/bin/env bash

gyds_network_chain_id() {
  case "${1,,}" in
    mainnet) printf '198282\n' ;;
    testnet) printf '198281\n' ;;
    *) return 1 ;;
  esac
}

gyds_network_default_port() {
  local network="${1,,}"
  local service="${2,,}"
  case "${network}:${service}" in
    mainnet:rpc) printf '8545\n' ;;
    mainnet:ws) printf '8546\n' ;;
    mainnet:p2p) printf '30303\n' ;;
    mainnet:metrics) printf '6060\n' ;;
    testnet:rpc) printf '9545\n' ;;
    testnet:ws) printf '9546\n' ;;
    testnet:p2p) printf '30304\n' ;;
    testnet:metrics) printf '6061\n' ;;
    *) return 1 ;;
  esac
}

gyds_normalize_uint() {
  local value="${1:-}"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  value="${value#"${value%%[!0]*}"}"
  printf '%s\n' "${value:-0}"
}

gyds_uint_le() {
  local LC_ALL=C
  local value limit
  value="$(gyds_normalize_uint "${1:-}")" || return 1
  limit="$(gyds_normalize_uint "${2:-}")" || return 1

  if [ "${#value}" -lt "${#limit}" ]; then
    return 0
  fi
  if [ "${#value}" -gt "${#limit}" ]; then
    return 1
  fi
  [[ "$value" == "$limit" || "$value" < "$limit" ]]
}

gyds_validate_and_init_genesis() {
  local genesis_file="${1:-}"
  local expected_chain_id="${2:-}"
  local data_dir="${3:-}"
  local geth_bin="${4:-}"
  local genesis_chain_id

  if [ -z "$genesis_file" ] || [ ! -f "$genesis_file" ]; then
    echo "Genesis file not found: ${genesis_file:-not specified}." >&2
    return 1
  fi
  if ! genesis_chain_id="$(jq -er \
    '.config.chainId | select(type == "number" and floor == . and . > 0)' \
    "$genesis_file" 2>/dev/null)"; then
    echo "Genesis file has no valid positive integer config.chainId." >&2
    return 1
  fi
  if [ "$genesis_chain_id" != "$expected_chain_id" ]; then
    echo "Genesis chainId ${genesis_chain_id} does not match ${expected_chain_id}." >&2
    return 1
  fi
  if [ -z "$data_dir" ] || [ -z "$geth_bin" ] || [ ! -x "$geth_bin" ]; then
    echo "A data directory and executable Geth binary are required." >&2
    return 1
  fi

  "$geth_bin" init --datadir "$data_dir" "$genesis_file"
}
