import { Router } from "express";
import { db } from "@workspace/db";
import { networkNodesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";

const router = Router();
const NODE_TYPES = ["main", "full", "lite", "rpc", "boost", "validator", "boot"] as const;
const NODE_STATUSES = ["connected", "disconnected"] as const;
const PUBLIC_NODE_FIELDS = {
  id: networkNodesTable.id,
  name: networkNodesTable.name,
  type: networkNodesTable.type,
  rpcUrl: networkNodesTable.rpcUrl,
  status: networkNodesTable.status,
  isActive: networkNodesTable.isActive,
} as const;

function validId(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function validHttpUrl(value: unknown): value is string {
  if (!validUrl(value)) return false;
  return value.startsWith("http://") || value.startsWith("https://");
}

function nodeValues(body: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};

  if (!partial || "name" in body) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 255) {
      return { error: "name is required and must be at most 255 characters" };
    }
    values.name = body.name.trim();
  }
  if (!partial || "type" in body) {
    if (typeof body.type !== "string" || !NODE_TYPES.includes(body.type as typeof NODE_TYPES[number])) {
      return { error: "type must be one of: main, full, lite, rpc, boost, validator, boot" };
    }
    values.type = body.type;
  }
  if (!partial || "rpcUrl" in body) {
    if (!validUrl(body.rpcUrl) || body.rpcUrl.length > 2048) {
      return { error: "rpcUrl must be a valid HTTP(S) or WebSocket URL" };
    }
    values.rpcUrl = body.rpcUrl.trim();
  }
  if ("enode" in body) {
    if (body.enode !== null && (typeof body.enode !== "string" || body.enode.length > 65535)) {
      return { error: "enode must be a string or null" };
    }
    values.enode = typeof body.enode === "string" ? body.enode.trim() : null;
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !NODE_STATUSES.includes(body.status as typeof NODE_STATUSES[number])) {
      return { error: "status must be one of: connected, disconnected" };
    }
    values.status = body.status;
  }
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") return { error: "isActive must be a boolean" };
    values.isActive = body.isActive;
  }
  return { values };
}

// Public consumers only see connected nodes so the wallet can read balances.
router.get("/", async (req, res) => {
  try {
    res.json(await db.select(PUBLIC_NODE_FIELDS).from(networkNodesTable).where(eq(networkNodesTable.isActive, true)).orderBy(networkNodesTable.name));
  } catch (err) {
    req.log.error({ err }, "Fetch public nodes error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin view includes disconnected nodes.
router.get("/admin", requireAdmin, async (req, res) => {
  try {
    res.json(await db.select().from(networkNodesTable).orderBy(networkNodesTable.name));
  } catch (err) {
    req.log.error({ err }, "Fetch nodes error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Probe an RPC from the server so localhost and private-network node URLs work.
router.post("/ping", requireAdmin, async (req: AdminRequest, res) => {
  const rpcUrl = req.body?.rpcUrl;
  if (!validHttpUrl(rpcUrl)) {
    res.status(400).json({ ok: false, error: "rpcUrl must be a valid HTTP(S) URL" });
    return;
  }
  try {
    const request = (method: string) => fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const [chainResponse, blockResponse] = await Promise.all([request("eth_chainId"), request("eth_blockNumber")]);
    const [chain, block] = await Promise.all([chainResponse.json(), blockResponse.json()]) as [
      { result?: string; error?: { message?: string } },
      { result?: string; error?: { message?: string } },
    ];
    if (!chainResponse.ok || !blockResponse.ok || chain.error || block.error) {
      res.json({ ok: false, error: chain.error?.message || block.error?.message || "RPC request failed" });
      return;
    }
    const chainId = Number.parseInt(chain.result || "", 16);
    if (!Number.isFinite(chainId)) {
      res.json({ ok: false, error: "RPC returned no chain ID" });
      return;
    }
    res.json({
      ok: true,
      chainId,
      blockNumber: block.result ? Number.parseInt(block.result, 16) : undefined,
      latencyMs: undefined,
    });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : "RPC unreachable" });
  }
});

// Persist the two explorer RPC endpoints and bootnode setting in the same
// server-side node catalog used by the public RPC proxy.
router.put("/runtime-settings", requireAdmin, async (req: AdminRequest, res) => {
  const { primaryRpc, bootnodeEnode } = req.body ?? {};
  const boostnodeRpc = req.body?.boostnodeRpc ?? req.body?.secondaryRpc;
  if (!validHttpUrl(primaryRpc) || !validHttpUrl(boostnodeRpc)) {
    res.status(400).json({ error: "primaryRpc and boostnodeRpc must be valid HTTP(S) URLs" });
    return;
  }
  if (bootnodeEnode !== undefined && bootnodeEnode !== null && typeof bootnodeEnode !== "string") {
    res.status(400).json({ error: "bootnodeEnode must be a string or null" });
    return;
  }

  try {
    const settings = [
      { name: "Explorer Primary RPC", type: "rpc" as const, rpcUrl: primaryRpc.trim(), enode: null, isActive: true },
      { name: "Explorer Boost Node", type: "boost" as const, rpcUrl: boostnodeRpc.trim(), enode: null, isActive: true },
      {
        name: "Explorer Bootnode",
        type: "boot" as const,
        rpcUrl: primaryRpc.trim(),
        enode: typeof bootnodeEnode === "string" && bootnodeEnode.trim() ? bootnodeEnode.trim() : null,
        isActive: typeof bootnodeEnode === "string" && Boolean(bootnodeEnode.trim()),
      },
    ];

    for (const setting of settings) {
      let existing = await db.query.networkNodesTable.findFirst({
        where: (table, operators) => operators.eq(table.name, setting.name),
      });
      // Rename the earlier secondary-RPC record in place when upgrading.
      if (!existing && setting.name === "Explorer Boost Node") {
        existing = await db.query.networkNodesTable.findFirst({
          where: (table, operators) => operators.eq(table.name, "Explorer Secondary RPC"),
        });
      }
      if (existing) {
        await db.update(networkNodesTable)
          .set({ ...setting, updatedAt: new Date() })
          .where(eq(networkNodesTable.id, existing.id));
      } else {
        await db.insert(networkNodesTable).values(setting);
      }
    }
    req.log.info({ by: req.admin!.walletAddress }, "Explorer runtime node settings updated");
    res.json({ success: true, settings });
  } catch (err) {
    req.log.error({ err }, "Update runtime node settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const result = nodeValues(req.body as Record<string, unknown>);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    const [node] = await db.insert(networkNodesTable).values(result.values as typeof networkNodesTable.$inferInsert).returning();
    req.log.info({ id: node.id, by: req.admin!.walletAddress }, "Network node created");
    res.status(201).json(node);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A node with this name already exists" });
      return;
    }
    req.log.error({ err }, "Create node error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const id = validId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid node id" });
      return;
    }
    const result = nodeValues(req.body as Record<string, unknown>, true);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    if (Object.keys(result.values).length === 0) {
      res.status(400).json({ error: "At least one node field must be provided" });
      return;
    }
    const [node] = await db.update(networkNodesTable)
      .set({ ...result.values, updatedAt: new Date() } as typeof networkNodesTable.$inferInsert)
      .where(eq(networkNodesTable.id, id))
      .returning();
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    req.log.info({ id, by: req.admin!.walletAddress }, "Network node updated");
    res.json(node);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A node with this name already exists" });
      return;
    }
    req.log.error({ err }, "Update node error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/toggle", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const id = validId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid node id" });
      return;
    }
    if (typeof req.body?.isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be a boolean" });
      return;
    }
    const [node] = await db.update(networkNodesTable)
      .set({ isActive: req.body.isActive, updatedAt: new Date() })
      .where(eq(networkNodesTable.id, id))
      .returning();
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    req.log.info({ id, isActive: node.isActive, by: req.admin!.walletAddress }, "Network node toggled");
    res.json(node);
  } catch (err) {
    req.log.error({ err }, "Toggle node error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const id = validId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid node id" });
      return;
    }
    const [node] = await db.delete(networkNodesTable).where(eq(networkNodesTable.id, id)).returning({ id: networkNodesTable.id });
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    req.log.info({ id, by: req.admin!.walletAddress }, "Network node deleted");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete node error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;