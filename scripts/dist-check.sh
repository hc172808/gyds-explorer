#!/usr/bin/env bash
# Verifies the production build emitted usable files in the artifact's public directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/artifacts/solana-explorer/dist/public"
fail() { echo "dist-check FAILED: $1" >&2; exit 1; }

[ -d "$DIST" ] || fail "missing build directory at $DIST"
[ -f "$DIST/index.html" ] || fail "missing $DIST/index.html"

grep -q "<div id=\"root\"" "$DIST/index.html" || fail "$DIST/index.html has no #root mount node"
grep -qE '<script[^>]+src=' "$DIST/index.html" || fail "$DIST/index.html references no bundled script"

ASSETS=$(find "$DIST" -name '*.js' | wc -l | tr -d ' ')
[ "$ASSETS" -gt 0 ] || fail "no JS bundles emitted in dist/"

CSS=$(find "$DIST" -name '*.css' | wc -l | tr -d ' ')
[ "$CSS" -gt 0 ] || fail "no CSS emitted in dist/"

echo "dist-check OK: index.html + $ASSETS JS bundle(s) + $CSS stylesheet(s)"
