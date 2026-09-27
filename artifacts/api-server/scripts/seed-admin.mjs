#!/usr/bin/env node
/**
 * Seed (or update) an admin wallet in the admin_wallets table.
 *
 * Usage:
 *   ADMIN_WALLET=0x... ADMIN_WALLET_LABEL=Founder node scripts/seed-admin.mjs
 *
 * Reads DATABASE_URL from the environment (or ../../.env via --env-file).
 */
import pg from "pg";

const wallet = (process.env.ADMIN_WALLET || "").toLowerCase();
const label = process.env.ADMIN_WALLET_LABEL || "Founder";

if (!wallet) {
  console.error("ADMIN_WALLET must be set to the public address that will sign in.");
  process.exit(1);
}
if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
  console.error(`Invalid wallet address: ${wallet}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set (or run via: npm run seed:admin).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(
    `INSERT INTO admin_wallets (wallet_address, label, is_active)
     VALUES ($1, $2, true)
     ON CONFLICT (wallet_address)
     DO UPDATE SET label = EXCLUDED.label, is_active = true
     RETURNING id, wallet_address, label, is_active`,
    [wallet, label],
  );
  console.log("Admin wallet seeded:", rows[0]);
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
