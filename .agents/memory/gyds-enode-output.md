---
name: GYDS enode output
description: Handling enode URLs returned by Geth IPC and preparing them for peer setup.
---

`geth attach --exec 'admin.nodeInfo.enode'` can print its string result with surrounding JSON quotes. Strip those quotes and validate the `enode://` format before showing or saving it for another node. A syntactically valid enode is not necessarily reachable: the advertised address must be reachable from peers, and the P2P port must be allowed through both host and provider firewalls.

**Why:** Copying the quoted console output into `MAIN_NODE_ENODE` or `static-nodes.json` makes the peer URL invalid; loopback or private advertised addresses also cannot serve public peers.

**How to apply:** Normalize and validate every operator-facing enode result, test the query against a live Geth IPC socket, and separately verify the deployed node's public address and TCP/UDP P2P port.
