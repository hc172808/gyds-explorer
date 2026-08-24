---
name: Standalone deployment constraints
description: Constraints that keep the standalone deployment aligned with the Vite artifact and node setup.
---

Standalone Explorer builds require both `PORT` and `BASE_PATH`; the Vite output is served from `dist/public`, not `dist`.

**Why:** The artifact Vite configuration intentionally requires these values and writes its production files under `dist/public`, so a generic `npm run build` or an Nginx root of `dist` fails.

**How to apply:** Any standalone deployment script that builds or serves the Explorer must provide `PORT`/`BASE_PATH` and point Nginx or the static server at `dist/public`.