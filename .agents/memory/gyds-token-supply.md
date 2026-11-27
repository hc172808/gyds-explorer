---
name: GYDS mainnet supply
description: Production native-coin supply target and genesis update boundary.
---

GYDS Mainnet's configured genesis supply target is 3,000,000,000 native GYDS at 18 decimals. Testnet uses its separate TGYDS configuration. Changing the genesis allocation does not change an already initialized chain.

**Why:** The user changed the mainnet supply target from 1 billion to 3 billion; genesis data is part of chain identity and cannot be updated by rebuilding the explorer.

**How to apply:** Update the mainnet node-setup defaults and public supply display, but never reset or reinitialize an existing mainnet node as part of a normal Git update.
