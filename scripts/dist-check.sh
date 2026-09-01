#!/usr/bin/env bash
# Verifies the production build emitted a usable dist/ at the workspace root.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
fail() { echo "dist-check FAILED: $1" >&2; exit 1; }

[ -d "$DIST" ] || fail "missing dist/ directory at $DIST"
[ -f "$DIST/index.html" ] || fail "missing dist/index.html"

grep -q "<div id=\"root\"" "$DIST/index.html" || fail "dist/index.html has no #root mount node"
grep -qE '<script[^>]+src=' "$DIST/index.html" || fail "dist/index.html references no bundled script"

ASSETS=$(find "$DIST" -name '*.js' | wc -l | tr -d ' ')
[ "$ASSETS" -gt 0 ] || fail "no JS bundles emitted in dist/"

CSS=$(find "$DIST" -name '*.css' | wc -l | tr -d ' ')
[ "$CSS" -gt 0 ] || fail "no CSS emitted in dist/"

echo "dist-check OK: index.html + $ASSETS JS bundle(s) + $CSS stylesheet(s)"
