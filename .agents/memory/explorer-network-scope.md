---
name: Explorer network scope
description: The user's selected network scope for the GYDS explorer.
---

Keep the user-facing explorer Mainnet-only. Admins can still configure Mainnet RPC endpoints through the admin dashboard or environment configuration. Internal Testnet node workflows are separate and should not be exposed by the explorer selector.

**Why:** The user chose to remove Testnet from the explorer while retaining Mainnet RPC configuration.

**How to apply:** Keep explorer network defaults and choices on Mainnet. Do not remove internal Testnet node support unless the user separately asks for that.
