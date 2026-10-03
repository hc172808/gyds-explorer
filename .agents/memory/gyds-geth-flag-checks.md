---
name: Geth flag checks under pipefail
description: Avoid false negatives when validating Geth command-line options.
---

Capture Geth's complete `--help` output before checking whether an option is present. Match the exact option token with whitespace boundaries; a substring check for `--mine` also matches longer options such as `--miner.gaslimit`. Avoid `geth --help | grep -q ...` under `pipefail`, because grep may stop reading after a match and cause the upstream process to exit from a broken pipe.

**Why:** A repair helper first rejected a verified Geth build that supports `--mine` because its strict pipeline reported failure, then a substring check incorrectly accepted an incompatible build because `--mine` prefixes `--miner...`.

**How to apply:** Store `--help` output in a variable while tolerating the command's help exit status, then use a boundary-aware exact-token match. If validation still fails, report the binary version and matching help lines before refusing replacement.