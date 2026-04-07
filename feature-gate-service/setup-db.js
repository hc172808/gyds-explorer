/**
 * GYDS Feature Gate Service - Database Setup
 * Run: node setup-db.js
 * 
 * Creates the required tables for feature gates and admin wallets.
 * You can also run these SQL statements directly in pgAdmin.
 */

require("dotenv").config({ path: "../.env" });
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "gyds_explorer",
  user: process.env.DB_USER || "gyds_admin",
  password: process.env.DB_PASSWORD,
});

const SETUP_SQL = `
-- Admin wallets table: stores authorized admin wallet addresses
CREATE TABLE IF NOT EXISTS admin_wallets (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  label VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Feature gates table: stores feature gate states
CREATE TABLE IF NOT EXISTS feature_gates (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(42)
);

-- Auth nonces table: stores one-time nonces for wallet signature verification
CREATE TABLE IF NOT EXISTS auth_nonces (
  wallet_address VARCHAR(42) PRIMARY KEY,
  nonce VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default feature gates
INSERT INTO feature_gates (id, name, description, status) VALUES
  ('eip-1559', 'EIP-1559 Base Fee', 'Dynamic base fee per gas mechanism', true),
  ('eip-2930', 'EIP-2930 Access Lists', 'Optional access lists for transactions', true),
  ('eip-3855', 'EIP-3855 PUSH0', 'PUSH0 opcode support', true),
  ('simd-296', 'SiMD-296 Protocol', 'GYDS network consensus enhancement', true),
  ('shanghai', 'Shanghai Upgrade', 'Beacon chain withdrawal support', true),
  ('eip-4337', 'Account Abstraction (EIP-4337)', 'Smart contract wallets as first-class accounts', true),
  ('verkle', 'Verkle Trees', 'Verkle tree state commitment scheme', true),
  ('eof', 'EOF (EVM Object Format)', 'Structured bytecode container format', true),
  ('eip-4844', 'EIP-4844 Proto-Danksharding', 'Blob-carrying transactions for L2 scaling', true),
  ('eip-6780', 'EIP-6780 SELFDESTRUCT Removal', 'Restricts SELFDESTRUCT to same-transaction context', true)
ON CONFLICT (id) DO NOTHING;

-- Insert a default admin wallet (CHANGE THIS to your actual admin wallet address)
INSERT INTO admin_wallets (wallet_address, label) VALUES
  ('0x0000000000000000000000000000000000000000', 'Default Admin - CHANGE ME')
ON CONFLICT (wallet_address) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_admin_wallets_address ON admin_wallets (wallet_address);
CREATE INDEX IF NOT EXISTS idx_feature_gates_status ON feature_gates (status);
`;

async function setup() {
  const client = await pool.connect();
  try {
    console.log("🔧 Setting up Feature Gate Service database tables...");
    await client.query(SETUP_SQL);
    console.log("✅ Tables created successfully:");
    console.log("   - admin_wallets");
    console.log("   - feature_gates");
    console.log("   - auth_nonces");
    console.log("");
    console.log("⚠️  IMPORTANT: Update the default admin wallet address in pgAdmin:");
    console.log("   UPDATE admin_wallets SET wallet_address = '0xYOUR_WALLET' WHERE id = 1;");
  } catch (err) {
    console.error("❌ Setup failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
