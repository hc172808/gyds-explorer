import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// GET /api/health — reachability + database probe used by the frontend
router.get("/health", async (_req, res) => {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    res.json({
      status: "healthy",
      database: "connected",
      uptime: process.uptime(),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: err instanceof Error ? err.message : "Unknown error",
      uptime: process.uptime(),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
