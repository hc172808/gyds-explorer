---
name: GYDS RPC exposure
description: The intended binding and firewall behavior for GYDS node roles.
---

RPC nodes are public by default because the `--rpc-node` mode is intended for wallets and websites. Full and lite nodes keep HTTP/WS on localhost unless `PUBLIC_RPC=yes` is explicitly configured. Main and validator authority RPC remains local.

**Why:** A node can appear healthy locally while remote clients still fail when the bind address, virtual-host allow-list, and firewall policy disagree. Public exposure must be intentional for non-RPC roles.

**How to apply:** When changing node setup or port diagnostics, keep the bind address, Geth host/origin settings, UFW rules, and health output aligned with the node role.