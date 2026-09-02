# GYDS Network Explorer

A Solana-compatible blockchain explorer that lets users browse blocks, transactions, and wallet addresses on the GYDS network.

## Run & Operate

- `artifacts/solana-explorer: web` workflow — runs the frontend preview
- `artifacts/api-server: API Server` workflow — runs the API service on its managed port when `API_SECRET_KEY` or `JWT_SECRET_KEY` is configured
- `npm run dev --workspace=@workspace/solana-explorer` — run the frontend by itself
- `npm run dev --workspace=@workspace/api-server` — run the API service by itself when `API_SECRET_KEY` or `JWT_SECRET_KEY` is configured
- `npm run typecheck` — full typecheck across all packages
- `sudo bash /var/www/gyds-explorer/check-services.sh` — check local services and configured ports
- `SERVER_SETUP.md` — complete Ubuntu deployment, port, firewall, and validator guide
- `sudo bash /var/www/gyds-explorer/update.sh` — pull the latest Git commit, rebuild, restart, and check health
- Required env: `VITE_RPC_URL` — primary RPC endpoint (default: https://rpc.netlifegy.com)
- Required env: `VITE_RPC_URL_2` — secondary/boost node endpoint (default: https://boost.netlifegy.com)
- Network chain ID: `198282` (hex: `0x3068a`)
- API service env: `API_SECRET_KEY` or `JWT_SECRET_KEY` — required JWT signing secret; the API workflow will not start without one
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

- The explorer calls Solana/GYDS RPC endpoints directly from the browser; authenticated admin and feature-gate routes use the local API service
- The API service must use `API_SECRET_KEY` or `JWT_SECRET_KEY` from Replit Secrets; do not invent or reuse another secret
- Admin login uses a wallet signature. The wallet must be seeded as an active `admin_wallets` row; API/JWT secrets only sign the resulting session token.
- Wallet extensions reject connection/signature requests from embedded Replit previews; open the explorer in a new browser tab before using Admin Login.
- Tailwind v3 (not v4) with PostCSS — copy script removed @tailwindcss/vite and set up postcss.config.js
- react-router-dom v7 `<BrowserRouter basename={import.meta.env.BASE_URL}>` for Replit path routing
- RPC endpoints configurable through Replit shared environment values (or a local `.env` during development) via `VITE_RPC_URL` / `VITE_RPC_URL_2` (the fallback is `https://boost.netlifegy.com`)

## Product

Users can search and explore the GYDS blockchain: view live block heights, gas prices, chain info, latest blocks and transactions, inspect individual blocks/transactions/addresses, browse programs, token supply, and use the transaction inspector.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT run `npm run dev` at workspace root — use the workflow or `npm run dev --workspace=@workspace/solana-explorer`
- Tailwind is v3 (with tailwind.config.ts + postcss), NOT the v4 vite plugin
- The app talks directly to RPC nodes and proxies `/api` to the API service on localhost port 8080 during Replit development

## Pointers

- The root `package.json` defines the npm workspace structure, TypeScript setup, and package details
