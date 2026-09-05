---
name: Replit managed artifact workflows
description: Imported multi-artifact apps expose managed workflow names and ports that cannot be overridden by ordinary workflow configuration.
---

Use the artifact-managed frontend and API workflows for registered artifacts instead of creating replacement workflows with the same names. Configure frontend development proxies against the API port assigned by the managed workflow, and remove failed duplicate combined workflows.

**Why:** Replacing a managed artifact workflow is rejected by Replit, while a custom combined workflow can fail to satisfy preview port detection even when its child server logs show ready.

**How to apply:** Check the managed workflow logs for the actual frontend/API ports, keep the managed services running, and make same-project proxy configuration follow those ports.