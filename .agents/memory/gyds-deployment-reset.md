---
name: GYDS deployment reset
description: The safety and ordering rules for rebuilding an existing GYDS deployment.
---

An existing deployment must never be reset implicitly. The reset path requires an explicit `YES`, stops managed services, removes node state and generated secrets, drops the explorer database, and then lets the normal setup flow recreate the selected node and application.

**Why:** A rerun can otherwise mix a new database password or node configuration with old state, causing service failures; deleting chain data or keys without confirmation is irreversible.

**How to apply:** Keep reset detection separate from the source checkout, retry database deletion after PostgreSQL becomes available, and preserve state when confirmation is declined.