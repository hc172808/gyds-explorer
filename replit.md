# GYDS Network Explorer

A Solana-compatible blockchain explorer that lets users browse blocks, transactions, and wallet addresses on the GYDS network.

## Run & Operate

- Replit setup: use Node.js 22+, run `npm ci`, then `npm run push --workspace=@workspace/db` against the development database.
- Start both managed workflows: `artifacts/api-server: API Server` and `artifacts/solana-explorer: web`. The API workflow also starts the disposable local RPC and lite test nodes; the separate gateway and canvas workflows are not needed.
- Required configuration: `DATABASE_URL` and one of `API_SECRET_KEY`, `JWT_SECRET_KEY`, legacy `JWT_SECRET`, or `SESSION_SECRET`. Replit provides these through the environment; a local `.env` file is optional.
- The preview uses simulated local test data on chain `198281` (`0x30689`), not a synced public blockchain. Test node state lives under `.replit-node/test-network/`.
- Verification: `npm run typecheck`, `npm test`, `npm run build`, and `npm run build --workspace=@workspace/api-server`. `/api/health` checks the database; `/api/rpc` accepts JSON-RPC requests.
- Frontend build files are written to `artifacts/solana-explorer/dist/public`, matching the artifact's static serving configuration.
- `npm run node:lite --workspace=@workspace/scripts` — run the Replit-testable lite RPC gateway on port `8545`
- `npm run node:rpc --workspace=@workspace/scripts` — run the Replit-testable RPC gateway on port `8555`
- `bash scripts/replit-dev.sh` — alternative combined launcher outside the managed workflows; do not run it alongside them
- `npm run dev --workspace=@workspace/solana-explorer` — run the frontend by itself
- `npm run dev --workspace=@workspace/api-server` — run the API service by itself when `API_SECRET_KEY`, `JWT_SECRET_KEY`, legacy `JWT_SECRET`, or `SESSION_SECRET` is configured
- `npm run typecheck` — full typecheck across all packages
- `REPLIT_NODE_TYPE=rpc bash scripts/replit-dev.sh` — start the local mining RPC profile
- `REPLIT_NODE_TYPE=lite bash scripts/replit-dev.sh` — start the lightweight local node profile
- `sudo bash /var/www/gyds-explorer/check-services.sh` — check local services and configured ports
- `SERVER_SETUP.md` — complete Ubuntu deployment, port, firewall, and validator guide
- `cd /var/www/gyds-explorer && sudo ./update.sh` — safely pull, install, build the frontend and API, restart services, and check health
- Admin → Auto Updates — enable or disable the monthly app and Ubuntu package update timer (10th at 03:00 America/Guyana time; no automatic reboot)
- Browser RPC env defaults to the same-origin `/api/rpc` proxy; server-side `GYDS_REMOTE_RPC_URL` and `GYDS_REMOTE_RPC_URL_2` select remote nodes.
- Network chain ID: `198282` (hex: `0x3068a`)
- Local node gateways try configured upstreams, reject incompatible chain IDs, and fall back to deterministic mock data when upstream access is unavailable. Check `/status` for the active source.
- API service env: `API_SECRET_KEY`, `JWT_SECRET_KEY`, legacy `JWT_SECRET`, or `SESSION_SECRET` — required JWT signing secret; the API workflow will not start without one
- Replit preview: the managed frontend proxies `/api` requests to the managed API service on localhost port 8080
- Ubuntu deployment: Nginx serves the static explorer on port 80 and port 8080 by default; `--web-port=PORT` changes the direct web port
- Validator setup: `node-setup.sh` configures Clique proof-of-authority authority nodes. It does not implement proof-of-stake staking.

## Stack

- npm workspaces, Node.js 22+, TypeScript 5.9
- Frontend: React + Vite, Tailwind v3, shadcn/ui
- Routing: react-router-dom v7 with `basename={import.meta.env.BASE_URL}`
- Charts: recharts, framer-motion
- State: @tanstack/react-query

## Where things live

- `artifacts/solana-explorer/src/` — all frontend source
- `artifacts/solana-explorer/src/pages/` — page components (Index, BlockDetail, TxDetail, etc.)
- `artifacts/solana-explorer/src/components/` — shared UI components
- `artifacts/solana-explorer/src/contexts/NetworkContext.tsx` — network/RPC switching logic
- `artifacts/solana-explorer/src/hookslib/` — custom data-fetching hooks
- `artifacts/solana-explorer/src/index.css` — theme (dark, neon-green accent, Space Grotesk + JetBrains Mono fonts)

## Architecture decisions

- The explorer uses the same-origin `/api/rpc` proxy from the browser; the API service can route that proxy to local or remote GYDS nodes.
- The API service must use `API_SECRET_KEY`, `JWT_SECRET_KEY`, legacy `JWT_SECRET`, or `SESSION_SECRET` from Replit Secrets; do not invent or reuse another secret
- Admin login uses a wallet signature. The wallet must be seeded as an active `admin_wallets` row; API/JWT secrets only sign the resulting session token.
- Wallet extensions reject connection/signature requests from embedded Replit previews; open the explorer in a new browser tab before using Admin Login.
- Tailwind v3 (not v4) with PostCSS — copy script removed @tailwindcss/vite and set up postcss.config.js
- react-router-dom v7 `<BrowserRouter basename={import.meta.env.BASE_URL}>` for Replit path routing
- RPC routing is configurable through `GYDS_RPC_MODE=local|remote|auto`, `GYDS_LOCAL_RPC_URL`, and `GYDS_REMOTE_RPC_URL` values in `.env`.
- The API proxy prefers the local lite gateway at `http://127.0.0.1:8545`; the separate local RPC gateway listens on `8555`
- The clone-safe Replit launcher overrides the frontend RPC values to `/api/rpc`; the API proxies that path to the local node at `REPLIT_RPC_PORT`
- The default Replit API launcher uses simulated test nodes. `REPLIT_USE_MOCK_NODES=0` selects the optional Geth launcher, which requires permitted Go dependencies and is not verified by the default preview setup.
- The first Replit start builds and caches Geth under `.replit-node/bin`; chain data and keys stay under `.replit-node/` and are disposable local test state
- The API answers `GET /` and `GET /api` with a service status response; the explorer website root is served by Nginx from `dist`
- Automatic monthly updates use a systemd timer installed by `deploy.sh` or `update.sh`; the database setting defaults to off, and scheduled updates run only when enabled by an admin

## Product

Users can search and explore the GYDS blockchain: view live block heights, gas prices, chain info, latest blocks and transactions, inspect individual blocks/transactions/addresses, browse programs, token supply, and use the transaction inspector.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT run `npm run dev` at workspace root — use the workflow or `npm run dev --workspace=@workspace/solana-explorer`
- Tailwind is v3 (with tailwind.config.ts + postcss), NOT the v4 vite plugin
- The app talks directly to RPC nodes and proxies `/api` to the API service on localhost port 8080 during Replit development
- The local Replit gateways speak HTTP JSON-RPC for testing; production `node-setup.sh` remains the path for a real synced Geth node with WebSocket support

## Pointers

- The root `package.json` defines the npm workspace structure, TypeScript setup, and package details
