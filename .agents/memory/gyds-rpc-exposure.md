---
name: GYDS RPC exposure
description: The intended binding and firewall behavior for GYDS node roles.
---

RPC nodes default to public bindings because the `rpc` role is intended for wallets and websites. For this deployment, the ISP blocks inbound port forwarding, so keep Geth bound to localhost and publish HTTP RPC through an outbound Cloudflare Tunnel. Set `PUBLIC_RPC=no` explicitly; otherwise the installer defaults RPC nodes to public. Main and validator authority RPC remains local.

**Why:** A node can appear healthy locally while remote clients still fail when the bind address, virtual-host allow-list, and firewall policy disagree. The ISP restriction also means direct inbound HTTPS/P2P forwarding is unavailable.

**How to apply:** For this RPC host, route Cloudflare Tunnel to `http://127.0.0.1:8545` and set its origin HTTP Host Header to `localhost`, matching Geth's virtual-host check. Ensure outbound P2P to the main node is allowed; do not expose ports 8545/8546 publicly.