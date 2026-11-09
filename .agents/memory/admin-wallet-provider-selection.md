---
name: Admin wallet provider selection
description: Which injected wallet should sign authenticated admin actions.
---

For admin actions that require a signature, use the injected EVM provider exposing the authenticated session's wallet address. Do not assume the generic `window.ethereum` is the right signer when multiple wallet extensions are installed.

**Why:** The user wants MetaMask, Trust Wallet, Phantom, or another compatible Web3 wallet, and provider multiplexers can otherwise route a transaction through the wrong account.

**How to apply:** Resolve a provider by the session account, then still verify the signer before deployment or minting. Preserve the existing admin-role checks; never bypass them to make a wallet flow work.
