# GYDS Network Explorer

A Solana-compatible blockchain explorer that lets users browse blocks, transactions, and wallet addresses on the GYDS network.

## Run & Operate

- `npm run dev --workspace=@workspace/solana-explorer` — run the frontend (workflow: `artifacts/solana-explorer: web`)
- `npm run dev --workspace=@workspace/api-server` — run the optional API service (workflow: `artifacts/api-server: API Server`)
- `npm run typecheck` — full typecheck across all packages
- Required env: `VITE_RPC_URL` — primary RPC endpoint (default: https://rpc.netlifegy.com)
- Required env: `VITE_RPC_URL_2` — secondary/boost node endpoint (default: https://boost.netlifegy.com)
- Network chain ID: `198282` (hex: `0x3068a`)
- API service env: `API_SECRET_KEY` or `JWT_SECRET_KEY` — required JWT signing secret; the API workflow will not start without one

## Stack

- npm workspaces, Node.js 20+, TypeScript 5.9
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

- Pure frontend app — no backend needed; calls Solana/GYDS RPC endpoints directly from the browser
- The API service is only needed for authenticated admin and feature-gate routes; do not invent or reuse another secret
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
- The app talks directly to RPC nodes — no api-server is used by this app

## Pointers

- The root `package.json` defines the npm workspace structure, TypeScript setup, and package details
