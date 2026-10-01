#!/bin/bash
set -e

# Install the running apps and their shared runtime/build packages. The optional
# OpenAPI code generator in @workspace/api-spec is not used during post-merge
# setup and currently pulls a package blocked by the Replit package firewall.
npm ci \
  --workspace=@workspace/api-server \
  --workspace=@workspace/solana-explorer \
  --workspace=@workspace/mockup-sandbox \
  --workspace=@workspace/db \
  --workspace=@workspace/scripts \
  --include-workspace-root=true
npm run push --workspace=@workspace/db
