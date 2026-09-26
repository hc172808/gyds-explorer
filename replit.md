# GYDS Network Explorer

A Solana-compatible blockchain explorer that lets users browse blocks, transactions, and wallet addresses on the GYDS network.

## Run & Operate

- `npm run dev --workspace=@workspace/solana-explorer` — run the frontend (workflow: `artifacts/solana-explorer: web`)
- `npm run dev --workspace=@workspace/api-server` — run the optional API service when `API_SECRET_KEY` or `JWT_SECRET_KEY` is configured
- `npm run node:lite --workspace=@workspace/scripts` — run the Replit-testable lite RPC gateway on port `8545`
- `npm run node:rpc --workspace=@workspace/scripts` — run the Replit-testable RPC gateway on port `8555`
- `npm run typecheck` — full typecheck across all packages
- `sudo bash /var/www/gyds-explorer/check-services.sh` — check local services and configured ports
- `sudo bash /var/www/gyds-explorer/update.sh` — pull the latest Git commit, rebuild, restart, and check health
- Required env: `VITE_RPC_URL` — primary RPC endpoint (default: https://rpc.netlifegy.com)
- Required env: `VITE_RPC_URL_2` — secondary/boost node endpoint (default: https://boost.netlifegy.com)
- Network chain ID: `198282` (hex: `0x3068a`)
- Local node gateways try `RPC_URL` / `RPC_URL_2`, reject incompatible chain IDs, and fall back to deterministic mock data when upstream access is unavailable. Check `/status` for `source: "upstream"` or `source: "mock"`.
- API service env: `API_SECRET_KEY` or `JWT_SECRET_KEY` — required JWT signing secret; the API workflow will not start without one
- Replit preview: the frontend and mockup workflows are the runnable preview targets; the optional API artifact remains available but requires an explicitly configured API/JWT secret and is not part of the frontend's normal runtime path

## Stack

- npm workspaces, Node.js 22.18.0+, TypeScript 5.9
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

- Explorer reads GYDS RPC through the same-origin `/api/rpc` proxy to avoid browser CORS failures; the API service is required for that proxy plus authenticated admin and feature-gate routes
- The standalone deployment keeps the explorer UI optional: the API/database can run headlessly, or `--node-only` can install only the blockchain node
- Tailwind v3 (not v4) with PostCSS — copy script removed @tailwindcss/vite and set up postcss.config.js
- react-router-dom v7 `<BrowserRouter basename={import.meta.env.BASE_URL}>` for Replit path routing
- RPC endpoints configurable through Replit shared environment values (or a local `.env` during development) via `VITE_RPC_URL` / `VITE_RPC_URL_2` (the fallback is `https://boost.netlifegy.com`)
- Replit's API artifact starts both local node services from `artifacts/api-server/.replit-artifact/artifact.toml`; the lite gateway is on `8545` and the separate RPC gateway is on `8555`
- Standalone deployment modes: `sudo ./deploy.sh [domain]` installs the web stack, `sudo ./deploy.sh --no-web` installs API/database without Explorer, and `sudo ./deploy.sh --node-only --node-type rpc` installs only an RPC-serving blockchain node
- Node setup supports `main`, `full`, `lite`, `rpc`, and `validator`; RPC nodes expose HTTP on `8545` and WebSocket RPC on `8546` without installing the Explorer web interface

## Product

Users can search and explore the GYDS blockchain: view live block heights, gas prices, chain info, latest blocks and transactions, inspect individual blocks/transactions/addresses, browse programs, token supply, and use the transaction inspector.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT run `npm run dev` at workspace root — use the workflow or `npm run dev --workspace=@workspace/solana-explorer`
- Tailwind is v3 (with tailwind.config.ts + postcss), NOT the v4 vite plugin
- The app uses `/api/rpc`; if the API service is absent, configure the frontend to use an RPC endpoint that explicitly allows browser CORS
- The local Replit gateways speak HTTP JSON-RPC for testing; production `node-setup.sh` remains the path for a real Geth lite/full/RPC node with WebSocket support

## Pointers

- The root `package.json` defines the npm workspace structure, TypeScript setup, and package details
