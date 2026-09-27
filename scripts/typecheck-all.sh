#!/usr/bin/env bash
# Typecheck every workspace. Library project references build first (they emit
# declarations the apps depend on), then app typechecks run in parallel to keep
# the total wall time well under CI build deadlines.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> building library project references"
npx tsc --build

pids=()
names=()
for pkg in artifacts/api-server artifacts/mockup-sandbox artifacts/solana-explorer scripts; do
  [ -f "$pkg/tsconfig.json" ] || continue
  ( cd "$pkg" && npx tsc -p tsconfig.json --noEmit ) &
  pids+=($!)
  names+=("$pkg")
done

status=0
for i in "${!pids[@]}"; do
  if wait "${pids[$i]}"; then
    echo "✓ ${names[$i]}"
  else
    echo "✗ ${names[$i]} failed typecheck"
    status=1
  fi
done

exit $status
