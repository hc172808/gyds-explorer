---
name: Go dependency firewall
description: Replit package-firewall behavior affecting the archived blockchain Go module
---

The Replit Go package firewall can reject `golang.org/x/crypto` downloads, including both an older pinned release and a newer attempted release, before Go compilation begins.

**Why:** The archived blockchain module cannot be meaningfully tested until its dependency source is permitted or replaced with an approved implementation; changing versions alone may not resolve a package-wide security-policy block.

**How to apply:** Treat this as an environment/dependency access issue first. Do not weaken security checks or claim the Go node passes compilation when the module download is blocked.