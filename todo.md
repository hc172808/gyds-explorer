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

---

# Authority, asset controls, wallet limits, and user transactions

This section records the authority and product controls needed for both the
native `GYDS` coin and the `GYD` token. Admin controls must be explicit,
audited, role-protected, and fail closed. Disabling an asset in the explorer
must not falsely imply that already-deployed blockchain contracts or native
protocol balances have been erased.

## 22. Define authority and roles

- [ ] Define the authority model for the network and both assets:
  - Network/protocol authority for native GYDS issuance, fees, validators, and
    genesis settings.
  - GYD token owner/minter authority for minting, burning, pausing, and supply
    controls.
  - Explorer administrator for listings, metadata, feature flags, and UI
    availability.
  - Compliance or operations role for reviewing purchases, limits, freezes,
    and support cases, if legally required.
  - Read-only auditor role for viewing settings, logs, and balances without
    changing them.
- [ ] Decide whether authority is held by a multisig, timelock, DAO, or another
      approved control system. Do not rely on one personal hot-wallet key for
      irreversible production actions.
- [ ] Separate on-chain authority from off-chain explorer administration.
      An explorer admin must not be able to secretly change the blockchain's
      native supply or bypass a token contract's on-chain permissions.
- [ ] Use least privilege: each role can perform only the actions it needs.
- [ ] Require wallet-based authentication with signed, expiring messages for
      admin access. Never use a wallet address alone as proof of authority.
- [ ] Protect admin APIs with server-side authorization checks; do not trust
      hidden buttons, browser state, or client-supplied role fields.
- [ ] Add two-person approval or a timelock for high-risk actions:
      minting, changing limits, pausing transfers, changing peg settings,
      changing contract addresses, and changing treasury destinations.
- [ ] Add session expiry, replay protection, nonce tracking, origin checks,
      rate limits, and audit logging for administrative actions.
- [ ] Define emergency recovery, key rotation, lost-admin-wallet, and
      compromised-key procedures before mainnet.
- [ ] Never put private keys, seed phrases, signing secrets, or multisig
      credentials in `.env`, source control, or browser-exposed variables.

## 23. Admin enable/disable controls for GYDS and GYD

- [ ] Add separate controls for the two assets:
  - `GYDS` native coin: visible/hidden in the explorer, wallet actions
    enabled/disabled, and purchase/send availability.
  - `GYD` token: listed/unlisted, transfers enabled/disabled where technically
    enforceable, purchases enabled/disabled, sends enabled/disabled, and
    contract address active/inactive.
- [ ] Define the meaning of each switch:
  - **Visible** controls explorer display only.
  - **Listed** controls whether the official asset appears in searches and
        token lists.
  - **Buy enabled** controls whether the application starts new purchase
        orders.
  - **Send enabled** controls whether the page offers a send flow.
  - **Transfers paused** must be enforced by the token contract or protocol,
        not only by hiding a UI button.
- [ ] Make disable actions fail closed:
  - Block new purchases and sends at the server/API and UI layers.
  - Re-check the current flag immediately before signing or submitting.
  - Explain why the action is unavailable and whether pending transactions are
        still processing.
  - Do not cancel, reverse, or claim to reverse confirmed blockchain
        transactions.
- [ ] Decide whether GYD requires an on-chain pause mechanism. If so, document
      who can pause, what events trigger it, how users are notified, and how
      it is resumed.
- [ ] Add an emergency global pause and separate per-asset pause, with
      prominent status display and an immutable audit trail.
- [ ] Prevent an admin from silently changing an official token address:
      require a new approval, chain/metadata validation, timelock, and visible
      change history.
- [ ] Show the current status, effective time, actor role, reason, and last
      change in the admin dashboard and relevant user pages.
- [ ] Add tests proving disabled assets cannot start a purchase or send flow,
      while read-only balances and confirmed transaction history remain
      available.

## 24. Configure wallet holding limits

- [ ] Define whether limits apply to:
  - Maximum native `GYDS` balance per wallet.
  - Maximum `GYD` balance per wallet.
  - Maximum amount per transfer.
  - Maximum daily/rolling-period sent amount.
  - Maximum daily/rolling-period purchased amount.
  - Maximum amount held by an unverified or restricted wallet.
- [ ] Add admin-configurable limits independently for `GYDS` and `GYD`, with
      optional global, wallet, role, jurisdiction, and risk-tier overrides.
- [ ] Store limits in integer base units with explicit decimals and never use
      floating-point comparisons for monetary values.
- [ ] Define the value `0` clearly; use an explicit enabled/disabled field so
      zero cannot be confused with “unlimited.”
- [ ] Define whether a limit is checked against pre-transaction balance,
      post-transaction balance, gross balance, or net balance after fees.
- [ ] Decide whether limits are enforced:
  - On chain in the native protocol or GYD contract.
  - In the purchase/send service before a transaction is signed.
  - In both places for defense in depth.
- [ ] Do not claim that an explorer-only limit prevents transfers made directly
      through another wallet or RPC. Enforce any mandatory limit on chain or
      through an authoritative transaction gateway.
- [ ] Reject transactions that would exceed a limit before collecting payment
      or requesting a wallet signature.
- [ ] Handle pending transactions and concurrent purchases without allowing
      users to bypass limits through parallel requests.
- [ ] Define an approved exception process with expiry, reason, approver, and
      audit record.
- [ ] Show users their current limit, remaining allowance, reset time, and a
      clear reason when an action is rejected.
- [ ] Add tests for exact-limit success, one-unit-over-limit failure, decimals,
      daily reset, concurrent requests, admin changes, and disabled assets.

## 25. Let users buy GYDS and GYD safely

- [ ] Decide what “buy” means for each asset:
  - Native GYDS sale, faucet, treasury distribution, or exchange order.
  - GYD purchase/mint against USD or another approved payment asset.
- [ ] Choose and document the payment provider, on-ramp, exchange, or
      treasury service. Do not build a fake balance update or mark an order
      paid without an authoritative payment confirmation.
- [ ] Before implementation, define price source, quote expiry, fees, spread,
      minimum/maximum purchase, slippage, settlement asset, and refund rules.
- [ ] Define whether GYD is minted on purchase, transferred from treasury
      inventory, or obtained through an exchange. Only an authorized on-chain
      minter may mint.
- [ ] Require identity, sanctions, fraud, age, jurisdiction, and transaction
      monitoring controls where applicable to the chosen product and location.
- [ ] Use a server-side order state machine:
      quoted → payment pending → payment confirmed → blockchain submitted →
      confirmed → failed/refunded.
- [ ] Make order processing idempotent so retries cannot deliver duplicate
      coins or tokens.
- [ ] Re-check asset enabled status, wallet limits, destination address, quote
      expiry, and available inventory/reserves at settlement time.
- [ ] Show users the quote, amount, fees, destination wallet, network, token
      contract (for GYD), and final confirmation before payment/signature.
- [ ] Never ask users to send funds to an address shown only in client-side
      code. Use verified server configuration and display the exact network.
- [ ] Add payment webhooks with signature verification, replay protection, and
      reconciliation against provider records.
- [ ] Do not expose payment-provider secrets, treasury private keys, or
      signing credentials to the browser.
- [ ] Add purchase receipts, transaction hashes, status polling, failure
      handling, refunds, support references, and exportable audit records.
- [ ] Test underpayment, overpayment, expired quote, duplicate webhook,
      rejected wallet signature, wrong network, failed transaction, RPC outage,
      and disabled-asset conditions.

## 26. Let users send GYDS and GYD from the page

- [ ] Add a wallet-connected send form with:
  - Asset selector limited to enabled/official assets.
  - Checksummed destination address validation.
  - Amount and decimal validation.
  - Max available balance and fee preview.
  - Current network/chain ID confirmation.
  - GYD contract-address and token-symbol confirmation.
  - Optional memo only if the network actually supports it.
- [ ] Clearly label the asset before signing:
  - Native coin: `GYDSChain (GYDS)`.
  - Token: `GYD` plus the verified contract address.
- [ ] Use native transaction submission for GYDS and the verified ERC-20
      `transfer` call for GYD. Never send an ERC-20 amount as native currency
      or use an unverified token contract.
- [ ] Re-check admin enable/disable state, holding limits, balance, network,
      destination, and current gas fee immediately before submission.
- [ ] Require the user's wallet to approve the transaction; the page must not
      hold or request the user's private key.
- [ ] Show a review step and transaction simulation or preflight where
      available, then display the exact transaction details being signed.
- [ ] Track submitted, pending, confirmed, failed, and replaced transactions
      by hash. Do not show “sent” until the receipt is confirmed.
- [ ] Prevent duplicate submissions from double-clicks, retries, refreshes, or
      repeated wallet events.
- [ ] Show a receipt with sender, recipient, asset, amount, fee, network,
      transaction hash, block, timestamp, and explorer link.
- [ ] Warn users that blockchain transfers are generally irreversible and that
      sending to the wrong address or network may permanently lose funds.
- [ ] Handle insufficient balance, insufficient gas, rejected signature,
      wrong-chain wallet, token approval errors, paused asset, limit exceeded,
      invalid recipient, RPC timeout, and reorg/replacement cases.
- [ ] Add tests for native sends, ERC-20 sends, exact decimals, zero address,
      self-send policy, insufficient funds, disabled assets, limits, and
      confirmation polling.

## 27. Admin screens, API, data, and audit records

- [ ] Extend the existing admin dashboard with dedicated sections for:
  - Asset status and metadata.
  - Native GYDS controls.
  - GYD token controls and verified contract address.
  - Wallet holding and transaction limits.
  - Purchase settings and settlement status.
  - Pending/confirmed/failed transactions.
  - Admin roles, approvals, and emergency pause.
- [ ] Add server-side endpoints for reading and changing settings; do not
      persist authoritative admin settings only in browser local storage.
- [ ] Persist versioned settings with actor, role, timestamp, reason, previous
      value, new value, approval status, and effective time.
- [ ] Persist wallet limits, overrides, purchase orders, payment references,
      blockchain transaction hashes, and audit events with idempotency keys.
- [ ] Add database constraints and server validation for addresses, asset
      identifiers, decimal precision, nonnegative amounts, and valid status
      transitions.
- [ ] Add role-based authorization to every read/write endpoint, including
      direct API calls that bypass the UI.
- [ ] Add rate limiting, abuse monitoring, structured logs, alerting, and
      retention/deletion rules appropriate for financial activity.
- [ ] Separate testnet and mainnet configuration, databases, treasury
      addresses, token addresses, and admin roles.
- [ ] Add reconciliation jobs that compare purchase records, payment records,
      on-chain receipts, treasury balances, and GYD total supply.

## 28. Authority and transaction acceptance criteria

- [ ] An authorized admin can independently enable or disable GYDS and GYD,
      and the result is enforced by every relevant API and user flow.
- [ ] Disabling an asset does not alter confirmed blockchain history or falsely
      promise reversal of completed transfers.
- [ ] An authorized admin can set and review separate holding, purchase, and
      transfer limits for GYDS and GYD.
- [ ] A wallet cannot exceed a mandatory limit through concurrent requests,
      retries, or direct alternate UI paths.
- [ ] Users can buy only through a verified payment/order flow and receive
      assets only after authoritative settlement.
- [ ] Users can send native GYDS and official GYD from the page after reviewing
      and signing the correct transaction in their own wallet.
- [ ] Every administrative change and financial action has an auditable actor,
      timestamp, reason/status, and transaction or payment reference.
- [ ] Emergency pause, key compromise, RPC outage, payment failure, refund,
      and wrong-address support procedures are documented and tested.
- [ ] Legal, custody, stablecoin, consumer-protection, and compliance review
      is complete before enabling real-money purchases or describing GYD as
      USD-pegged.