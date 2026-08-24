# GYDS Network Explorer

A Solana-compatible blockchain explorer that lets users browse blocks, transactions, and wallet addresses on the GYDS network.

## Run & Operate

- `pnpm --filter @workspace/solana-explorer run dev` — run the frontend (workflow: `artifacts/solana-explorer: web`)
- `pnpm --filter @workspace/api-server run dev` — run the optional API service (workflow: `artifacts/api-server: API Server`)
- `pnpm run typecheck` — full typecheck across all packages
- Required env: `VITE_RPC_URL` — primary RPC endpoint (default: https://rpc.netlifegy.com)
- Required env: `VITE_RPC_URL_2` — secondary/boost node endpoint (default: https://boost.netlifegy.com)
- Network chain ID: `198282` (hex: `0x3068a`)
- API service env: `API_SECRET_KEY` or `JWT_SECRET_KEY` — required JWT signing secret; the API workflow will not start without one

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
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
- Standalone deployment modes: `sudo ./deploy.sh [domain]` installs the web stack, `sudo ./deploy.sh --no-web` installs API/database without Explorer, and `sudo ./deploy.sh --node-only --node-type rpc` installs only an RPC-serving blockchain node
- Node setup supports `main`, `full`, `lite`, `rpc`, and `validator`; RPC nodes expose HTTP on `8545` and WebSocket RPC on `8546` without installing the Explorer web interface

## Product

Users can search and explore the GYDS blockchain: view live block heights, gas prices, chain info, latest blocks and transactions, inspect individual blocks/transactions/addresses, browse programs, token supply, and use the transaction inspector.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT run `pnpm dev` at workspace root — use the workflow or `pnpm --filter @workspace/solana-explorer run dev`
- Tailwind is v3 (with tailwind.config.ts + postcss), NOT the v4 vite plugin
- The app uses `/api/rpc`; if the API service is absent, configure the frontend to use an RPC endpoint that explicitly allows browser CORS

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
