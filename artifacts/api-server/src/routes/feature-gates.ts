import { Router } from "express";
import { db } from "@workspace/db";
import { featureGatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";

const router = Router();

// GET /feature-gates — list all feature gates (public)
router.get("/", async (req, res) => {
  try {
    const gates = await db.select().from(featureGatesTable).orderBy(featureGatesTable.name);
    res.json(gates);
  } catch (err) {
    req.log.error({ err }, "Fetch feature gates error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /feature-gates/:id — toggle a feature gate (admin only)
router.put("/:id", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body as { status?: boolean };

    if (typeof status !== "boolean") {
      res.status(400).json({ error: "status must be a boolean" });
      return;
    }

    const rows = await db
      .update(featureGatesTable)
      .set({ status, updatedAt: new Date(), updatedBy: req.admin!.walletAddress })
      .where(eq(featureGatesTable.id, id))
      .returning();

    if (rows.length === 0) {
      res.status(404).json({ error: "Feature gate not found" });
      return;
    }

    req.log.info({ id, status, by: req.admin!.walletAddress }, "Feature gate toggled");
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Toggle feature gate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
