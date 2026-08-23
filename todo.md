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

---

# GYDSChain and GYD token product TODO

This section extends the deployment checklist with the requested coin identity,
branding, wallet configuration, and token setup. It describes work to be
implemented later; the values below are the requested defaults and must be
verified before a production deployment.

## 13. Define the two assets clearly

- [ ] Treat **GYDSChain** as the network's native coin:
  - Full name: `GYDSChain`
  - Symbol: `GYDS`
  - Requested initial/max supply: `1,000,000,000 GYDS`
  - Native decimals: confirm the chain's supported value, currently expected
    to be 18 for EVM wallet compatibility.
- [ ] Treat **GYD** as a separate token deployed on GYDSChain:
  - Token name: `GYD` or the final approved full name
  - Symbol: `GYD`
  - Requested supply: `10,000,000,000 GYD`
  - Intended value: pegged to USD at `1 GYD = 1 USD`, subject to the backing
    and redemption design below.
- [ ] Do not represent the native GYDS coin as an ERC-20 contract. Its balance
      and supply are part of the network/genesis or protocol configuration.
- [ ] Do not invent a GYD contract address. The address only exists after the
      GYD contract is deployed on chain and the deployment transaction
      confirms.
- [ ] Document whether each supply is a hard cap or an initial allocation:
  - GYDS: fixed `1B` genesis supply, or a defined emission schedule.
  - GYD: fixed `10B` cap, or controlled minting against verified reserves.
- [ ] Record the smallest unit and display precision for both assets, and use
      integer base units for all balances and supply calculations.

## 14. Add coin logo and project information

- [ ] Add a supported way to provide a GYDSChain logo without changing source
      code for each deployment:
  - Preferred: a checked-in public asset such as
        `artifacts/solana-explorer/public/assets/gyds-logo.png`.
  - Optional: a configurable public HTTPS logo URL.
- [ ] Add validation for logo files:
  - PNG, SVG, or WebP only.
  - Provide a square image with a documented minimum resolution.
  - Reject unsafe SVG content or sanitize SVG before displaying it.
  - Do not allow arbitrary filesystem paths or untrusted HTML.
- [ ] Add configurable project information:
  - Coin/network name: `GYDSChain`
  - Native symbol: `GYDS`
  - Short description and full “About GYDSChain” text
  - Official website, documentation, explorer, and support links
  - Logo URL or public asset path
  - Chain ID: `198282` (`0x3068a`)
  - Primary and secondary RPC URLs
- [ ] Display the logo and About information consistently in the explorer
      header, network information view, footer, token/network metadata, and
      wallet-add flow where appropriate.
- [ ] Add an admin or configuration screen only if this information must be
      edited at runtime; otherwise use build-time public configuration.
- [ ] Ensure public branding values are not treated as secrets and do not place
      private keys, deployer seed phrases, or credentials in `VITE_*` variables.

## 15. Add environment configuration

- [ ] Add documented public configuration entries to `.env.example` and the
      explorer's environment documentation. Suggested names:

      VITE_NATIVE_COIN_NAME=GYDSChain
      VITE_NATIVE_COIN_SYMBOL=GYDS
      VITE_NATIVE_COIN_DECIMALS=18
      VITE_NATIVE_COIN_SUPPLY=1000000000
      VITE_NATIVE_COIN_LOGO_URL=/assets/gyds-logo.png
      VITE_NATIVE_COIN_DESCRIPTION=
      VITE_GYD_NAME=GYD
      VITE_GYD_SYMBOL=GYD
      VITE_GYD_DECIMALS=18
      VITE_GYD_INITIAL_SUPPLY=10000000000
      VITE_GYD_MAX_SUPPLY=10000000000
      VITE_GYD_PEG_CURRENCY=USD
      VITE_GYD_PEG_VALUE=1
      VITE_GYD_TOKEN_ADDRESS=

- [ ] Keep the actual GYD contract address empty until deployment, then set
      it to the checksummed address returned by the deployment.
- [ ] Decide whether `VITE_GYD_PEG_VALUE` is only display metadata or is used
      by application logic. It must not be presented as proof that the token
      is actually backed or redeemable.
- [ ] Clarify the requested “piggy USD” wording before implementation. The
      intended requirement appears to be “pegged to USD”; record the final
      legal/product wording and backing model.
- [ ] Keep all private deployment credentials in the server secret manager or
      wallet tooling. Never commit them to `.env`, `.env.example`, source
      control, or the browser bundle.
- [ ] Add runtime validation for required values:
  - Valid non-empty names and symbols.
  - Whole-number supplies that fit the chosen decimals.
  - A valid EVM contract address when `VITE_GYD_TOKEN_ADDRESS` is set.
  - A valid HTTPS logo URL when a URL is used.
  - No negative supply or silently truncated numeric values.

## 16. Establish GYDS native supply

- [ ] Locate the actual GYDSChain genesis, node, or protocol configuration
      that controls native coin supply. The explorer alone cannot mint or
      change the native coin supply.
- [ ] Configure or verify the requested `1,000,000,000 GYDS` supply at the
      protocol level.
- [ ] Define the initial distribution:
  - Genesis allocation wallet(s).
  - Treasury, validator, faucet, or ecosystem allocations.
  - Vesting and unlock rules, if any.
  - Transaction-fee policy and whether fees are burned or paid to validators.
- [ ] Decide whether the 1B amount is fixed forever or whether additional
      issuance is possible under consensus rules.
- [ ] Generate and securely record the genesis/deployment artifacts needed by
      validators. Do not store private keys in the repository.
- [ ] Verify total native supply from an independent node/RPC query and show it
      in the explorer's supply page.
- [ ] Add tests for base-unit conversion, total supply display, and rounding.

## 17. Design and deploy GYD

- [ ] Decide the token standard supported by GYDSChain. The current code and
      wallet flow assume an EVM-compatible ERC-20 token.
- [ ] Review `token-contract.sol` and the generated artifact before production.
      The current template supports configurable name, symbol, decimals,
      initial supply, owner, minting, burning, and ownership transfer, but it
      does not by itself create USD reserves, an oracle, redemption, audits, or
      compliance controls.
- [ ] Create a production-specific GYD contract configuration:
  - Name and symbol fixed to the approved values.
  - Decimals fixed and documented, normally 18.
  - Initial supply and maximum supply set according to the approved tokenomics.
  - Minting disabled for a fixed-supply token, or strictly controlled if
      reserves-backed issuance is required.
  - Burning behavior defined for redemption.
  - Ownership and admin roles secured with a multisig or approved custody
      process rather than a personal hot wallet.
- [ ] Add a hard maximum supply check if GYD must never exceed `10B`.
- [ ] If GYD is intended to be USD-backed, define before deployment:
  - Who holds the USD or equivalent reserves.
  - How reserves are verified and reported.
  - Who can mint and burn, and what evidence is required.
  - How users redeem GYD for USD, including fees and limits.
  - What happens if the peg breaks or the reserve provider is unavailable.
  - Legal, accounting, compliance, and independent audit requirements.
- [ ] Do not describe GYD as “stable” in the UI until the backing, issuance,
      redemption, and risk controls have been approved.
- [ ] Compile and test the final contract with the chosen Solidity toolchain.
- [ ] Test transfer, approval, transferFrom, mint, burn, ownership transfer,
      zero-address rejection, supply cap, decimals, and failure cases.
- [ ] Perform an independent smart-contract security review before mainnet
      deployment.
- [ ] Deploy first to a test network or private staging chain.
- [ ] Deploy to GYDSChain mainnet only after recording:
  - Contract address.
  - Deployment transaction hash.
  - Deployer and owner/multisig address.
  - Compiler version and verified source.
  - Constructor arguments.
  - Decimals and supply in base units.
  - Deployment date and network chain ID.
- [ ] Verify and publish the contract source and ABI in the explorer.

## 18. Create and register the GYD token address

- [ ] Add a deliberate deployment flow that connects a wallet, switches to
      chain ID `198282`, and shows the exact constructor settings before the
      user confirms.
- [ ] After confirmation, wait for the deployment transaction and read the
      contract address from the confirmed receipt.
- [ ] Show the address, transaction hash, network, token name, symbol,
      decimals, and total supply with copy buttons and explorer links.
- [ ] Persist the approved address in the public deployment configuration or a
      trusted token registry. Do not make users guess or manually type it.
- [ ] Validate that the address is deployed on GYDSChain and that its
      `name()`, `symbol()`, `decimals()`, and `totalSupply()` match the approved
      GYD configuration before publishing it.
- [ ] Make the address available to token-balance queries and token detail
      pages.
- [ ] Support a clear “Add GYD token to wallet” action using
      `wallet_watchAsset` where the wallet supports it, with:
  - Token contract address.
  - Symbol `GYD`.
  - Decimals.
  - Logo URL.
- [ ] Explain that a token contract address is different from the user's
      wallet address. The user must not send tokens to the contract address
      unless the documented operation requires it.

## 19. Make both assets available when adding the network to a wallet

- [ ] Update the wallet network-add request with:
  - Chain name: `GYDSChain` or the final approved network name.
  - Chain ID: `0x3068a`.
  - RPC URL(s): the final production HTTPS endpoints.
  - Native currency name: `GYDSChain`.
  - Native currency symbol: `GYDS`.
  - Native decimals: the verified value.
  - Block explorer URL: the final public explorer URL.
- [ ] Understand the wallet behavior:
  - Adding the network makes native `GYDS` available automatically as the
        network currency.
  - Adding the network alone does not automatically add arbitrary ERC-20
        tokens in every wallet.
  - GYD must be added using its deployed contract address and token metadata,
        either through `wallet_watchAsset` or a wallet token-import flow.
- [ ] Provide one user-facing “Add GYDSChain to wallet” action for the network.
- [ ] Provide a separate “Add GYD token to wallet” action after the verified
      contract address is available.
- [ ] If a wallet supports a combined onboarding flow, call the network-add
      request first, wait for success, then call the token-add request.
- [ ] Handle rejected requests, unsupported wallet methods, wrong-network
      errors, unavailable RPC endpoints, and mobile/deep-link behavior.
- [ ] Test MetaMask and other target wallets on desktop and mobile.
- [ ] Confirm the wallet displays the native `GYDS` balance and imported `GYD`
      balance from the same chain.

## 20. Explorer and API integration for both assets

- [ ] Add native GYDS metadata to network info, supply, address, transaction,
      fee, and balance displays.
- [ ] Add the verified GYD token to token lists, token balances, token detail
      pages, search, and contract metadata.
- [ ] Display token balances using the contract's decimals and never JavaScript
      floating-point arithmetic for raw amounts.
- [ ] Add clear labels distinguishing:
  - Native coin: `GYDSChain (GYDS)`.
  - USD-pegged token: `GYD`.
  - Contract address versus wallet address.
- [ ] Make unknown or unverified token metadata visibly distinct from the
      official GYD listing.
- [ ] Add backend/API registry support only if token metadata must be managed
      server-side. Otherwise keep the official public token configuration
      version-controlled and reviewable.
- [ ] Add tests for wallet network payloads, token-add payloads, contract
      metadata validation, and wrong-chain rejection.

## 21. Acceptance checklist for the coin/token release

- [ ] The explorer shows the GYDSChain logo, name, symbol, description, chain
      ID, and official links.
- [ ] The network's native supply is verified as `1B GYDS` or the approved
      final tokenomics.
- [ ] GYD's final name, symbol, decimals, supply/cap, peg wording, and backing
      model are approved.
- [ ] GYD is deployed on chain ID `198282` and its source is verified.
- [ ] The official GYD contract address is recorded and validated.
- [ ] Adding GYDSChain to a compatible wallet shows native `GYDS`.
- [ ] Adding the official GYD token shows `GYD` with the correct logo,
      decimals, and balance.
- [ ] The explorer links to the correct contract and transaction pages.
- [ ] No private keys or credentials are included in the repository or browser
      bundle.
- [ ] Testnet and mainnet addresses are clearly separated.
- [ ] Supply, peg, reserve, and admin controls are documented for users.