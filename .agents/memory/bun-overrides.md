---
name: Bun override limitations
description: Keep dependency overrides consistent between npm and Bun lockfiles.
---

Bun may ignore nested or package-version-scoped `overrides` and leave a transitive package unchanged in `bun.lock`, even when npm applies the override.

**Why:** A security override that appears only in npm's resolution creates inconsistent lockfiles and a false sense that the vulnerability is fixed.

**How to apply:** Prefer upgrading or replacing the parent dependency, or use a flat override compatible with every consumer. Verify both lockfiles and run Bun's frozen install.
