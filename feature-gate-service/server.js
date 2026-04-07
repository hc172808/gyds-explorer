/**
 * GYDS Feature Gate Service
 * Standalone Express server for managing feature gates with wallet-based admin auth.
 * 
 * Endpoints:
 *   GET  /api/feature-gates          - List all feature gates (public)
 *   PUT  /api/feature-gates/:id      - Toggle a feature gate (admin only)
 *   POST /api/auth/nonce             - Request a nonce for wallet signing
 *   POST /api/auth/verify            - Verify wallet signature and get JWT
 *   GET  /api/auth/me                - Get current admin info from JWT
 */

require("dotenv").config({ path: "../.env" });
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.FEATURE_GATE_PORT || 3002;
const JWT_SECRET = process.env.API_SECRET_KEY || "change-me-secret";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "gyds_explorer",
  user: process.env.DB_USER || "gyds_admin",
  password: process.env.DB_PASSWORD,
});

// Middleware
app.use(cors({
  origin: (process.env.API_CORS_ORIGINS || "http://localhost:8080").split(","),
  credentials: true,
}));
app.use(express.json());

// ─── Auth Middleware ───────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Auth Routes ──────────────────────────────────────────────────

// Request a nonce for wallet signature
app.post("/api/auth/nonce", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const address = walletAddress.toLowerCase();

    // Check if wallet is an authorized admin
    const adminCheck = await pool.query(
      "SELECT id FROM admin_wallets WHERE LOWER(wallet_address) = $1 AND is_active = TRUE",
      [address]
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: "Wallet not authorized as admin" });
    }

    // Generate and store nonce
    const nonce = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO auth_nonces (wallet_address, nonce, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (wallet_address) DO UPDATE SET nonce = $2, created_at = NOW()`,
      [address, nonce]
    );

    res.json({
      nonce,
      message: `Sign this message to authenticate as GYDS admin:\n\nNonce: ${nonce}`,
    });
  } catch (err) {
    console.error("Nonce error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Verify wallet signature and issue JWT
app.post("/api/auth/verify", async (req, res) => {
  try {
    const { walletAddress, signature } = req.body;
    if (!walletAddress || !signature) {
      return res.status(400).json({ error: "Missing walletAddress or signature" });
    }

    const address = walletAddress.toLowerCase();

    // Get stored nonce
    const nonceResult = await pool.query(
      "SELECT nonce, created_at FROM auth_nonces WHERE wallet_address = $1",
      [address]
    );
    if (nonceResult.rows.length === 0) {
      return res.status(400).json({ error: "No nonce found. Request a new one." });
    }

    const { nonce, created_at } = nonceResult.rows[0];

    // Check nonce expiry (5 minutes)
    const nonceAge = Date.now() - new Date(created_at).getTime();
    if (nonceAge > 5 * 60 * 1000) {
      return res.status(400).json({ error: "Nonce expired. Request a new one." });
    }

    // Verify signature
    const message = `Sign this message to authenticate as GYDS admin:\n\nNonce: ${nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();

    if (recoveredAddress !== address) {
      return res.status(401).json({ error: "Signature verification failed" });
    }

    // Check admin status again
    const adminCheck = await pool.query(
      "SELECT id, label FROM admin_wallets WHERE LOWER(wallet_address) = $1 AND is_active = TRUE",
      [address]
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: "Wallet not authorized" });
    }

    // Delete used nonce
    await pool.query("DELETE FROM auth_nonces WHERE wallet_address = $1", [address]);

    // Issue JWT (24h expiry)
    const token = jwt.sign(
      {
        walletAddress: address,
        label: adminCheck.rows[0].label,
        role: "admin",
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ token, walletAddress: address, label: adminCheck.rows[0].label });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current admin info
app.get("/api/auth/me", requireAdmin, (req, res) => {
  res.json({ walletAddress: req.admin.walletAddress, label: req.admin.label, role: req.admin.role });
});

// ─── Feature Gate Routes ──────────────────────────────────────────

// Get all feature gates (public)
app.get("/api/feature-gates", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, description, status, updated_at FROM feature_gates ORDER BY name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggle feature gate (admin only)
app.put("/api/feature-gates/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (typeof status !== "boolean") {
      return res.status(400).json({ error: "status must be a boolean" });
    }

    const result = await pool.query(
      `UPDATE feature_gates SET status = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3 RETURNING *`,
      [status, req.admin.walletAddress, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Feature gate not found" });
    }

    console.log(`Feature ${id} ${status ? "enabled" : "disabled"} by ${req.admin.walletAddress}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Admin Wallet Management Routes ───────────────────────────────

// List all admin wallets
app.get("/api/admin/wallets", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, wallet_address, label, is_active, created_at FROM admin_wallets ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch wallets error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add admin wallet
app.post("/api/admin/wallets", requireAdmin, async (req, res) => {
  try {
    const { walletAddress, label } = req.body;
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    const result = await pool.query(
      "INSERT INTO admin_wallets (wallet_address, label) VALUES ($1, $2) RETURNING *",
      [walletAddress.toLowerCase(), label || null]
    );
    console.log(`Admin wallet added: ${walletAddress} by ${req.admin.walletAddress}`);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Wallet address already exists" });
    }
    console.error("Add wallet error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggle admin wallet active status
app.put("/api/admin/wallets/:id/toggle", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const result = await pool.query(
      "UPDATE admin_wallets SET is_active = $1 WHERE id = $2 RETURNING *",
      [is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Toggle wallet error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove admin wallet
app.delete("/api/admin/wallets/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM admin_wallets WHERE id = $1 RETURNING wallet_address",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    console.log(`Admin wallet removed: ${result.rows[0].wallet_address} by ${req.admin.walletAddress}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Remove wallet error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Health ───────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "feature-gate-service" });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.listen(PORT, () => {
  console.log(`⚡ GYDS Feature Gate Service running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
