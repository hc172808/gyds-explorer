---
name: GYD mint compatibility
description: Backward-compatible mint amount semantics for existing and new GYD contracts.
---

Keep the existing `mint(address,uint256)` whole-token semantics unchanged for deployed contracts. New factory contracts should expose an explicit raw-unit mint method and a capability signal; the admin UI can then support fractional six-decimal GYD while falling back to whole amounts for legacy contracts.

**Why:** Existing on-chain contracts cannot be upgraded by changing the explorer, and silently changing amount units could mint the wrong supply.

**How to apply:** When changing GYD or token-factory mint behavior, preserve the old entry point and detect precision support before submitting a mint.
