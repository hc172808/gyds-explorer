---
name: Opt-in update scheduling
description: Safety boundary for unattended Git updates on the Ubuntu deployment.
---

Unattended deployments should use a systemd timer for Git pulls, builds, and restarts. The API should only persist an admin-controlled database flag; the scheduled updater checks that flag and exits without changing the checkout when updates are disabled. Do not expose a privileged shell or Git operation directly through an API route.

**Why:** The app may also run in Replit, where systemd is not available, and a web process should not be the privileged update runner. Keeping the timer and opt-in check separate prevents the setting from claiming updates are active when no scheduler exists.

**How to apply:** When adding or changing unattended updates, gate the UI on scheduler availability, keep updates disabled by default, and make the timer re-check the database flag before it pulls or restarts services.
