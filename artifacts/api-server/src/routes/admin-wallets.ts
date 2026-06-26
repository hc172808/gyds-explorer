import { Router } from "express";
import { db } from "@workspace/db";
import { adminWalletsTable, featureGatesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";

const router = Router();

const DEFAULT_GATES = [
  { id: "token-deployment", name: "Token Deployment", description: "Allow in-browser ERC-20 token deployment on GYDS chain" },
  { id: "admin-dashboard",  name: "Admin Dashboard",  description: "Show the admin dashboard link to authenticated admins" },
  { id: "block-explorer",   name: "Block Explorer",   description: "Enable full block and transaction explorer pages" },
  { id: "tx-inspector",     name: "TX Inspector",     description: "Enable the transaction inspector tool" },
];

// POST /admin/wallets/bootstrap — register first admin wallet (only when table is empty)
router.post("/bootstrap", async (req, res) => {
  try {
    const count = await db.select({ c: sql<number>`count(*)::int` }).from(adminWalletsTable);
    if (count[0].c > 0) {
      res.status(403).json({ error: "Bootstrap already completed. Use the admin panel to manage wallets." });
      return;
    }

    const { walletAddress, label } = req.body as { walletAddress?: string; label?: string };
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }

    const [wallet] = await db
      .insert(adminWalletsTable)
      .values({ walletAddress: walletAddress.toLowerCase(), label: label ?? "Bootstrap Admin" })
      .returning();

    // Seed default feature gates if none exist
    const gateCount = await db.select({ c: sql<number>`count(*)::int` }).from(featureGatesTable);
    if (gateCount[0].c === 0) {
      await db.insert(featureGatesTable).values(
        DEFAULT_GATES.map((g) => ({ ...g, status: true }))
      );
    }

    req.log.info({ addr: walletAddress }, "Bootstrap admin wallet created");
    res.json({ success: true, wallet });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Wallet address already exists" });
      return;
    }
    req.log.error({ err }, "Bootstrap error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/wallets — list all admin wallets (admin only)
router.get("/", requireAdmin, async (req, res) => {
  try {
    const wallets = await db
      .select()
      .from(adminWalletsTable)
      .orderBy(adminWalletsTable.createdAt);
    res.json(wallets);
  } catch (err) {
    req.log.error({ err }, "Fetch wallets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/wallets — add an admin wallet (admin only)
router.post("/", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { walletAddress, label } = req.body as { walletAddress?: string; label?: string };
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }

    const rows = await db
      .insert(adminWalletsTable)
      .values({ walletAddress: walletAddress.toLowerCase(), label: label ?? null })
      .returning();

    req.log.info({ addr: walletAddress, by: req.admin!.walletAddress }, "Admin wallet added");
    res.json(rows[0]);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Wallet address already exists" });
      return;
    }
    req.log.error({ err }, "Add wallet error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/wallets/:id/toggle — toggle active status (admin only)
router.put("/:id/toggle", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body as { isActive?: boolean };

    const rows = await db
      .update(adminWalletsTable)
      .set({ isActive })
      .where(eq(adminWalletsTable.id, id))
      .returning();

    if (rows.length === 0) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Toggle wallet error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/wallets/:id — remove an admin wallet (admin only)
router.delete("/:id", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db
      .delete(adminWalletsTable)
      .where(eq(adminWalletsTable.id, id))
      .returning({ walletAddress: adminWalletsTable.walletAddress });

    if (rows.length === 0) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }
    req.log.info({ addr: rows[0].walletAddress, by: req.admin!.walletAddress }, "Admin wallet removed");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Remove wallet error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
