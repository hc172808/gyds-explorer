---
name: Replit package firewall behavior
description: Safe handling of dependency installs blocked by Replit's package firewall.
---

A package-firewall 404 is a security block, not evidence that a public package URL is stale. Check whether the dependency has a safe newer release, and do not override the registry or otherwise route around the firewall. If a blocked dependency belongs only to optional code-generation or development tooling, routine setup can install only the workspaces needed to run the application while leaving that tool available for a later safe replacement.

**Why:** Replit documentation identifies these firewall 404s as intentionally blocked packages; bypassing the firewall would defeat that protection.

**How to apply:** Keep ordinary setup scoped to runtime/build workspaces when optional tooling is not required. If the blocked package is needed for the product, use a maintained alternative or resolve the security block through the supported process before installing it.