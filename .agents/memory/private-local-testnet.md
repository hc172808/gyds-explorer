---
name: Private local Testnet
description: Scope and safety boundaries for the Replit-local GYDS development chain and faucet.
---

Treat the Replit private local Testnet as an isolated development chain, not the public GYDS Testnet, even though both use chain ID 198281. Its blocks, balances, and contracts are not shared with the public network, and its test coins have no real-world value. Keep its state separate from Mainnet, keep RPC and WebSocket access local, and do not expose the unlocked faucet account.

**Why:** The user chose a private local chain for token testing. Reusing the public Testnet chain ID can make wallet network labels misleading, while exposing its unlocked account could let others drain the local faucet.

**How to apply:** Clearly label private-chain actions, keep faucet transactions on the local node only, and never imply that local test funds or contracts exist on a public network.
