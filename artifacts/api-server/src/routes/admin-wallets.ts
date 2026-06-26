import { Router } from "express";
import { db } from "@workspace/db";
import { adminWalletsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";

const router = Router();

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
    const { is_active } = req.body as { is_active?: boolean };

    const rows = await db
      .update(adminWalletsTable)
      .set({ isActive: is_active })
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
