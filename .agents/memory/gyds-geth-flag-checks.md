---
name: Geth flag checks under pipefail
description: Avoid false negatives when validating Geth command-line options.
---

Capture Geth's complete `--help` output before checking whether an option is present. Avoid `geth --help | grep -q ...` under `pipefail`, because grep may stop reading after a match and cause the upstream process to exit from a broken pipe.

**Why:** A repair helper rejected a verified Geth build that supports `--mine` because its strict pipeline reported failure despite the option appearing in the help output.

**How to apply:** Store `--help` output in a variable while tolerating the command's help exit status, then test the captured text. If validation still fails, report the binary version and matching help lines before refusing replacement.