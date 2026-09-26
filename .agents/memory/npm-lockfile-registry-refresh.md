---
name: npm lockfile registry refresh
description: How to remove stale internal registry URLs from an npm v3 lockfile.
---

When a package-lock.json already contains resolved tarball URLs from an
internal registry, `npm install --package-lock-only` can preserve those URLs
even when a public registry is configured. A full intentional lockfile
regeneration against the target registry is required.

**Why:** Standalone deployments must not depend on Replit's internal package
firewall, and a project `.npmrc` alone does not rewrite existing lockfile
entries.

**How to apply:** Configure the public npm registry, regenerate the lockfile
with npm against that registry, and search the resulting lockfile for internal
hostnames before committing it.