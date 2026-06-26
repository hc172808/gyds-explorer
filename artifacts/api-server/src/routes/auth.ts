import { Router } from "express";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import crypto from "crypto";
import { db } from "@workspace/db";
import { adminWalletsTable, authNoncesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";

const router = Router();
const JWT_SECRET = process.env.API_SECRET_KEY!;

// POST /auth/nonce — request a nonce for wallet signing
router.post("/nonce", async (req, res) => {
  try {
    const { walletAddress } = req.body as { walletAddress?: string };
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }
    const address = walletAddress.toLowerCase();

    // Check if wallet is an authorized admin
    const admin = await db.query.adminWalletsTable.findFirst({
      where: (t, { eq, and }) => and(eq(sql`LOWER(${t.walletAddress})`, address), eq(t.isActive, true)),
    });
    if (!admin) {
      res.status(403).json({ error: "Wallet not authorized as admin" });
      return;
    }

    const nonce = crypto.randomBytes(32).toString("hex");

    // Upsert nonce
    await db.insert(authNoncesTable).values({ walletAddress: address, nonce }).onConflictDoUpdate({
      target: authNoncesTable.walletAddress,
      set: { nonce, createdAt: new Date() },
    });

    res.json({
      nonce,
      message: `Sign this message to authenticate as GYDS admin:\n\nNonce: ${nonce}`,
    });
  } catch (err) {
    req.log.error({ err }, "Nonce error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/verify — verify wallet signature and issue JWT
router.post("/verify", async (req, res) => {
  try {
    const { walletAddress, signature } = req.body as { walletAddress?: string; signature?: string };
    if (!walletAddress || !signature) {
      res.status(400).json({ error: "Missing walletAddress or signature" });
      return;
    }
    const address = walletAddress.toLowerCase();

    // Get stored nonce
    const nonceRow = await db.query.authNoncesTable.findFirst({
      where: (t) => eq(t.walletAddress, address),
    });
    if (!nonceRow) {
      res.status(400).json({ error: "No nonce found. Request a new one." });
      return;
    }

    // Check nonce expiry (5 minutes)
    const nonceAge = Date.now() - new Date(nonceRow.createdAt).getTime();
    if (nonceAge > 5 * 60 * 1000) {
      res.status(400).json({ error: "Nonce expired. Request a new one." });
      return;
    }

    // Verify signature
    const message = `Sign this message to authenticate as GYDS admin:\n\nNonce: ${nonceRow.nonce}`;
    const recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();
    if (recoveredAddress !== address) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    // Check admin status
    const admin = await db.query.adminWalletsTable.findFirst({
      where: (t, { and }) => and(eq(sql`LOWER(${t.walletAddress})`, address), eq(t.isActive, true)),
    });
    if (!admin) {
      res.status(403).json({ error: "Wallet not authorized" });
      return;
    }

    // Delete used nonce
    await db.delete(authNoncesTable).where(eq(authNoncesTable.walletAddress, address));

    // Issue JWT
    const token = jwt.sign(
      { walletAddress: address, label: admin.label, role: "admin" },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({ token, walletAddress: address, label: admin.label });
  } catch (err) {
    req.log.error({ err }, "Verify error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /auth/me — get current admin info
router.get("/me", requireAdmin, (req: AdminRequest, res) => {
  res.json({ walletAddress: req.admin!.walletAddress, label: req.admin!.label, role: req.admin!.role });
});

export default router;
