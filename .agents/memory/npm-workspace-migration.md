---
name: npm workspace migration
description: Constraints for keeping this monorepo usable with npm instead of pnpm.
---

The workspace must use npm-compatible dependency specifications: concrete semver values for shared catalog dependencies and local `file:` links for internal workspace packages.

**Why:** npm does not understand pnpm's `catalog:` or `workspace:*` protocols, and a root preinstall guard can make otherwise valid npm installs fail before dependencies are resolved.

**How to apply:** Keep the root `package.json` `workspaces` list, commit `package-lock.json`, and use `npm run <script> --workspace=<workspace-name>` for targeted commands.