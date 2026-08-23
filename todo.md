# GYDS Explorer production deployment TODO

Use this checklist to prepare and verify the GYDS Explorer for deployment on a
standalone Ubuntu 22.04 server. Keep the existing application architecture and
use **npm only**. This document records the requested work; it is not a claim
that the work has already been completed.

## Target production environment

- [ ] Ubuntu 22.04
- [ ] Node.js `22.18.0` or newer
- [ ] npm as the package manager
- [ ] PostgreSQL
- [ ] Nginx
- [ ] PM2
- [ ] Production deployment outside Replit

## 1. Remove pnpm enforcement

- [ ] Inspect the root `package.json` and every package/workspace
      `package.json`.
- [ ] Inspect `preinstall`, `install`, `postinstall`, and `prepare` scripts.
- [ ] Remove any script that blocks npm with messages such as
      `Use pnpm instead`.
- [ ] Ensure `npm install` is allowed.
- [ ] Do not add a pnpm requirement or pnpm-only configuration.
- [ ] Do not automatically delete `package-lock.json`.
- [ ] Do not automatically delete `yarn.lock` unless there is a documented,
      legitimate reason.

## 2. Require a compatible Node.js version

- [ ] Review all dependency engine requirements and deployment assumptions.
- [ ] Update the appropriate `package.json` `engines` field to clearly require
      Node.js `>=22.18.0`.
- [ ] Account for dependencies that require Node 22 or newer, including:
      `@scalar/helpers`, `@scalar/json-magic`, `@scalar/openapi-parser`,
      `commander@15`, and `orval@8.26.0`.
- [ ] Update deployment setup so it installs and verifies Node 22, not Node 20.
- [ ] Verify on the server with:

      node --version

  The result must be `v22.18.0` or newer.

## 3. Use the public npm registry

- [ ] Search the entire repository for:
  - `package-firewall.replit.local`
  - `.npmrc`
  - `npm_config_registry`
  - npm registry overrides
  - custom package registries
  - Replit-specific package installation settings
- [ ] Remove project configuration that redirects package downloads through
      Replit's internal package firewall.
- [ ] Ensure production npm resolves packages from:

      https://registry.npmjs.org/

- [ ] Check the effective registry on the server with:

      npm config get registry

- [ ] Confirm it prints `https://registry.npmjs.org/` and does not reference
      `package-firewall.replit.local` or another internal registry.
- [ ] Investigate and eliminate errors such as:
      `npm error 409 Conflict - GET http://package-firewall.replit.local/npm/...`

## 4. Make `package-lock.json` npm-compatible

- [ ] Review the existing `package-lock.json` for npm compatibility,
      workspace links, registry URLs, and stale package-manager metadata.
- [ ] Regenerate the lockfile with npm if it is stale or contains invalid
      dependency resolution data.
- [ ] Do not use pnpm or yarn to regenerate dependencies.
- [ ] Prefer this clean installation command:

      npm install

- [ ] If peer dependency resolution requires it, support:

      npm install --legacy-peer-deps

- [ ] Confirm installation does not require:
  - `pnpm install`
  - `yarn install`
- [ ] Record whether `package-lock.json` was regenerated and why.

## 5. Verify npm workspaces

- [ ] Review the root workspace declarations and all workspace package names.
- [ ] Confirm local workspace dependencies resolve correctly under npm.
- [ ] Verify the main explorer build:

      npm run build --workspace=@workspace/solana-explorer

- [ ] Verify the root build:

      npm run build

- [ ] Verify any additional package or workspace build commands used by the
      deployment script.
- [ ] Keep the existing workspace layout; do not migrate it to pnpm or
      restructure the repository.

## 6. Fix the deployment script

- [ ] Inspect `deploy.sh`, `update.sh`, setup scripts, PM2 configuration, and
      any related deployment helpers.
- [ ] Change any `NODE_VERSION="20"` or equivalent Node 20 setup to Node 22.
- [ ] Ensure the deployment process enforces or verifies Node.js
      `>=22.18.0`, rather than merely installing an unspecified Node 22.
- [ ] Keep npm commands in the deployment script.
- [ ] Do not replace npm commands with pnpm commands.
- [ ] Ensure the script installs dependencies, builds the correct workspaces,
      and starts the expected production processes.
- [ ] Confirm the script is safe to run on Ubuntu 22.04 with Nginx and PM2.

## 7. Audit every package manifest

- [ ] Review the root `package.json`.
- [ ] Review the package manifest for the API service.
- [ ] Review `indexer/package.json`.
- [ ] Review any `feature-gate-service/package.json`.
- [ ] Review every other `package.json` found under workspace/package
      directories.
- [ ] Remove any pnpm-only installation requirement.
- [ ] Remove any Replit-specific registry configuration.
- [ ] Check scripts, `engines`, package-manager fields, local `file:` links,
      and workspace dependency declarations for npm compatibility.

## 8. Audit all package lifecycle and run scripts

- [ ] Search all package manifests and shell scripts for:
  - `preinstall`
  - `install`
  - `postinstall`
  - `prepare`
  - `build`
  - `dev`
  - `start`
- [ ] Remove scripts that intentionally block npm.
- [ ] Confirm build and start scripts use commands available on the target
      Ubuntu server.
- [ ] Confirm development-only Replit behavior is not required for production.
- [ ] Preserve scripts that are legitimate and package-manager neutral.

## 9. Keep the scope limited

- [ ] Do not rewrite the application.
- [ ] Do not change the database schema unless a build fix absolutely
      requires it.
- [ ] Do not change the configured RPC endpoints.
- [ ] Do not change the frontend architecture.
- [ ] Do not migrate package managers.
- [ ] Do not make unrelated dependency upgrades or refactors.
- [ ] Do not replace npm with pnpm or add pnpm-only requirements.

## 10. Verify from a clean state

Perform this verification on a clean Ubuntu checkout after the changes:

      npm --version
      node --version
      npm config get registry
      npm install --legacy-peer-deps
      npm run build

- [ ] Confirm Node is `22.18.0` or newer.
- [ ] Confirm npm is the active package manager.
- [ ] Confirm the registry is exactly `https://registry.npmjs.org/`.
- [ ] Confirm dependency installation completes without the Replit package
      firewall.
- [ ] Confirm the full build completes successfully.
- [ ] If `npm install` works without peer compatibility overrides, prefer and
      document the simpler `npm install` command.
- [ ] Test the production process under PM2.
- [ ] Test the application through Nginx.
- [ ] Check relevant application, PM2, Nginx, and deployment logs.

## 11. Final repository search and warning report

Run a final search for:

- [ ] `Use pnpm instead`
- [ ] `pnpm`
- [ ] `package-firewall.replit.local`
- [ ] `replit.local`

- [ ] Report every remaining occurrence.
- [ ] Explain why each remaining occurrence is legitimate, such as historical
      documentation or a non-production Replit helper.
- [ ] Remove every occurrence that affects npm installation or standalone
      production deployment.
- [ ] Record remaining dependency warnings, peer dependency warnings, engine
      warnings, and known runtime limitations.

## 12. Final handoff summary

After implementation, provide a concise handoff containing:

- [ ] Files changed.
- [ ] Node.js version requirement.
- [ ] npm registry configuration.
- [ ] Confirmation that npm is the package manager.
- [ ] Whether `package-lock.json` was regenerated.
- [ ] Exact Ubuntu deployment commands.
- [ ] Remaining warnings or dependency issues.
- [ ] Any required environment variables or external services, without
      committing secrets.

## Expected Ubuntu deployment sequence

Adapt paths and service names to the final deployment script, but the
documented production flow should be approximately:

      cd /path/to/gyds-explorer
      node --version
      npm --version
      npm config set registry https://registry.npmjs.org/
      npm config get registry
      npm install --legacy-peer-deps
      npm run build
      pm2 start <production-process-or-ecosystem-config>
      pm2 save
      sudo systemctl reload nginx

The final handoff must replace `<production-process-or-ecosystem-config>` with
the exact command supported by the repository after the deployment scripts have
been reviewed.

## Useful repository search commands

      find . -name package.json -o -name .npmrc -o -name package-lock.json
      grep -RInE 'Use pnpm instead|pnpm|package-firewall\.replit\.local|replit\.local|npm_config_registry' . --exclude-dir=node_modules --exclude-dir=.git
      npm config get registry
      npm ls

## Notes for future contributors

- This checklist intentionally describes the requested production work rather
  than silently applying it.
- Update each checkbox as the corresponding change or verification is
  completed.
- Add a dated note below when a decision, warning, or deployment constraint is
  discovered.

### Decision and verification log

- Date:
- Person/agent:
- Changes made:
- Commands run:
- Results:
- Remaining warnings: