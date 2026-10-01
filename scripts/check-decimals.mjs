#!/usr/bin/env node
/**
 * CI guard: protocol metadata, node scripts, and UI token decimals must match
 * chain-spec.json (GYDS 9, GYD 6).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const spec = JSON.parse(readFileSync(path.join(root, "chain-spec.json"), "utf8"));
const GYDS = spec.coins.GYDS.decimals;
const GYD = spec.coins.GYD.decimals;

const errors = [];
if (GYDS !== 9) errors.push(`chain-spec.json: GYDS decimals are ${GYDS}, expected 9`);
if (GYD !== 6) errors.push(`chain-spec.json: GYD decimals are ${GYD}, expected 6`);
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
  { label: "wallet nativeCurrency decimals", re: /nativeCurrency:\s*\{[^}]*decimals:\s*(\d+)/, expected: GYDS },
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

check("artifacts/solana-explorer/src/pages/Dashboard.tsx", [
  { label: "GYDS fallback decimals", re: /symbol:\s*"GYDS"[^}]*decimals:\s*(\d+)/, expected: GYDS },
]);

check("artifacts/solana-explorer/src/pages/TokenBalances.tsx", [
  { label: "GYDS fallback decimals", re: /symbol:\s*"GYDS"[^}]*decimals:\s*(\d+)/, expected: GYDS },
]);

check("artifacts/api-server/src/routes/coin-settings.ts", [
  { label: "GYDS default decimals", re: /symbol:\s*"GYDS"[^}]*decimals:\s*(\d+)/, expected: GYDS },
  { label: "fixed GYDS decimals", re: /CORE_COIN_DECIMALS:\s*Record<string,\s*number>\s*=\s*\{\s*GYDS:\s*(\d+)/, expected: GYDS },
  { label: "fixed GYD decimals", re: /CORE_COIN_DECIMALS:[\s\S]*?GYD:\s*(\d+)/, expected: GYD },
]);

check("node-setup.sh", [
  { label: "installer native decimals default", re: /^NATIVE_DECIMALS=(\d+)$/m, expected: GYDS },
  { label: "installer native decimals invariant", re: /\[\[ "\$NATIVE_DECIMALS" = "(\d+)" \]\]/, expected: GYDS },
]);

check("node-verify.sh", [
  { label: "verifier expected native decimals default", re: /EXPECTED_NATIVE_DECIMALS="\$\{EXPECTED_NATIVE_DECIMALS:-(\d+)\}"/, expected: GYDS },
  { label: "verifier native decimals invariant", re: /\[ "\$EXPECTED_NATIVE_DECIMALS" = "(\d+)" \]/, expected: GYDS },
]);

check("pre-launch-check.sh", [
  { label: "pre-launch native decimals invariant", re: /if \[ "\$NATIVE_DECIMALS" != "(\d+)" \]/, expected: GYDS },
  { label: "chain spec GYDS decimal expectation", re: /\[ "\$SPEC_DEC" = "(\d+)" \]/, expected: GYDS },
]);

check("node.env.example", [
  { label: "node environment native decimals", re: /^NATIVE_DECIMALS=(\d+)$/m, expected: GYDS },
]);

if (errors.length) {
  console.error("❌ Token decimals check failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✅ Token decimals match chain spec (GYDS=${GYDS}, GYD=${GYD})`);
