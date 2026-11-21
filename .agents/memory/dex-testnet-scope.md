---
name: Testnet DEX scope
description: Product constraints for the GYDSChain exchange prototype.
---

Keep the GYDSChain DEX a testnet prototype, and do not treat a testnet “USDT” ticker as verified Tether. Do not expand it to real-value networks or assets without the user's explicit direction.

**Why:** The user selected a testnet prototype, and no official stablecoin contract or router was provided.

**How to apply:** Preserve chain ID 198281 checks and visible testnet/unaudited warnings. Do not deploy contracts or submit wallet transactions on the user's behalf.
