---
name: Replit local RPC gateway
description: The Replit node services are testing gateways, not production consensus nodes.
---

The Replit lite and RPC test gateways must enforce the configured GYDS chain identity (`198281` / `0x30689` in development; `198282` / `0x3068a` in production) before trusting an upstream and should report whether responses came from an upstream or deterministic mock fallback.

**Why:** The configured public endpoints can be unreachable or return a different chain, which would make the explorer display valid-looking but incorrect blockchain data.

**How to apply:** Keep the local services safe for cloned Replit workspaces with upstream timeouts, short retry backoff, explicit status reporting, and mock fallback enabled by default. Force the development API proxy to local mode so unavailable remote catalog nodes cannot delay testnet requests. Use `node-setup.sh` for real synced Geth nodes.