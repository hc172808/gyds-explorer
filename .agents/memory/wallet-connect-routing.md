---
name: Wallet connect routing
description: Expected behavior when a wallet connection should also sign the user in
---

Connecting from the wallet page must complete the nonce-and-signature sign-in flow before routing regular users to `/dashboard` and privileged users to `/admin`.

**Why:** The user chose signed login followed by a role-specific redirect so a wallet-only connection is not mistaken for an authenticated dashboard session.

**How to apply:** Any connect action that promises dashboard access must persist the authenticated session first and reuse the shared role-based destination logic; do not navigate after `eth_requestAccounts` alone.