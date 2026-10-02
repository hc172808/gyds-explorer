---
name: Replit managed artifact workflows
description: Imported multi-artifact apps expose managed workflow names and ports that cannot be overridden by ordinary workflow configuration.
---

Use the artifact-managed frontend and API workflows for registered artifacts instead of creating replacement workflows with the same names. Configure frontend development proxies against the API port assigned by the managed workflow, and remove failed duplicate combined workflows.

**Why:** Replacing a managed artifact workflow is rejected by Replit, while a custom combined workflow can fail to satisfy preview port detection even when its child server logs show ready.

Imported artifact manifests can exist while artifact and workflow inventories are empty. A validated manifest replacement refreshes registration for existing manifests without scaffolding over the imported code.

**Why:** The import did not initially populate the runtime inventory; registering a replacement artifact would unnecessarily duplicate the application.

**How to apply:** If inventories are empty, check existing manifests first and use the supported manifest validation/replacement flow before creating a new artifact.

**How to apply:** Check the managed workflow logs for the actual frontend/API ports, keep the managed services running, and make same-project proxy configuration follow those ports.