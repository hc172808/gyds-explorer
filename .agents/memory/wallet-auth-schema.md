---
name: Wallet auth schema
description: Development setup requirement for the explorer's wallet nonce and session routes
---

The wallet authentication API depends on the database schema being applied before the API is tested. A healthy database connection alone does not prove that the `admin_wallets` and `auth_nonces` tables exist.

**Why:** An imported workspace can start the API and pass `/api/health` while wallet nonce requests return HTTP 500 because the auth relations have not been created yet.

**How to apply:** After installing dependencies or importing the project, push the checked-in Drizzle schema to the development database before debugging wallet or admin login behavior. Production schema changes follow the project's normal publish/deployment migration process.