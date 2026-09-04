#!/usr/bin/env node
/**
 * CI guard: UI token decimals must match the chain spec (GYDS 18, GYD 6).
 * Fails the build if any source file drifts (e.g. reintroduces 9 decimals).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const spec = JSON.parse(readFileSync(path.join(root, "chain-spec.json"), "utf8"));
const GYDS = spec.coins.GYDS.decimals;
const GYD = spec.coins.GYD.decimals;

const errors = [];
const read = (rel) => {
  const p = path.join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

function check(rel, patterns) {
  const src = read(rel);
  if (src === null) return; // optional file
  for (const { label, re, expected } of patterns) {
    const m = src.match(re);
    if (!m) {
      errors.push(`${rel}: could not find ${label}`);
      continue;
    }
    const actual = Number(m[1]);
    if (actual !== expected) {
      errors.push(`${rel}: ${label} is ${actual}, expected ${expected}`);
    }
  }
}

check("artifacts/solana-explorer/src/lib/coins.ts", [
  { label: "GYDS_COIN.decimals", re: /GYDS_COIN[\s\S]*?decimals:\s*(\d+)/, expected: GYDS },
  { label: "GYD_COIN.decimals", re: /GYD_COIN:[\s\S]*?decimals:\s*(\d+)/, expected: GYD },
]);

check("artifacts/solana-explorer/src/lib/wallet.ts", [
  { label: "native coin decimals default", re: /VITE_NATIVE_COIN_DECIMALS\s*\|\|\s*(\d+)/, expected: GYDS },
  { label: "GYD decimals default", re: /VITE_GYD_DECIMALS\s*\|\|\s*(\d+)/, expected: GYD },
]);

check("artifacts/solana-explorer/src/lib/useTokenDeploy.ts", [
  {
    label: "wallet_addEthereumChain nativeCurrency decimals",
    re: /nativeCurrency:\s*\{[^}]*symbol:\s*"GYDS"[^}]*decimals:\s*(\d+)/,
    expected: GYDS,
  },
]);

check("artifacts/solana-explorer/src/pages/MyWallet.tsx", [
  { label: "GYDS fallback decimals", re: /symbol:\s*"GYDS"[^}]*decimals:\s*(\d+)/, expected: GYDS },
  { label: "GYD fallback decimals", re: /symbol:\s*"GYD"[^}]*decimals:\s*(\d+)/, expected: GYD },
]);

// Guard against lamport-style 1e9 conversions on GYDS values.
const coins = read("artifacts/solana-explorer/src/lib/coins.ts") ?? "";
if (/1e9|10\s*\*\*\s*9|1_000_000_000/.test(coins)) {
  errors.push("coins.ts contains a 9-decimal (1e9) conversion — GYDS uses 18 decimals");
}

if (errors.length) {
  console.error("❌ Token decimals check failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✅ Token decimals match chain spec (GYDS=${GYDS}, GYD=${GYD})`);
