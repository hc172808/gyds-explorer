import { Router } from "express";
import { db } from "@workspace/db";
import { networkNodesTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const router = Router();
const LOCAL_RPC_ENDPOINT = process.env.REPLIT_RPC_URL || process.env.LOCAL_RPC_URL;
const RPC_ENDPOINTS = [
  LOCAL_RPC_ENDPOINT,
  process.env.REPLIT_LITE_RPC_URL,
  process.env.VITE_RPC_URL || "https://rpc.netlifegy.com",
  process.env.BOOSTNODE_RPC_URL || process.env.VITE_BOOSTNODE_RPC_URL || process.env.VITE_RPC_URL_2 || "https://boost.netlifegy.com",
].filter((endpoint): endpoint is string => Boolean(endpoint));
const EXPECTED_CHAIN_ID = "0x3068a";
const RPC_TIMEOUT_MS = 5000;

router.post("/", async (req, res) => {
  const { method, params = [], id = Date.now() } = req.body ?? {};

  if (typeof method !== "string" || !Array.isArray(params)) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid JSON-RPC request" }, id });
    return;
  }

  let endpoints = RPC_ENDPOINTS;
  const nodeId = Number(req.query.nodeId);
  try {
    if (Number.isSafeInteger(nodeId) && nodeId > 0) {
      const [node] = await db.select({ rpcUrl: networkNodesTable.rpcUrl })
        .from(networkNodesTable)
        .where(and(eq(networkNodesTable.id, nodeId), eq(networkNodesTable.isActive, true)))
        .limit(1);
      if (!node) {
        res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Configured node not found" }, id });
        return;
      }
      endpoints = [node.rpcUrl];
    } else {
      const nodes = await db.select({ rpcUrl: networkNodesTable.rpcUrl })
        .from(networkNodesTable)
        .where(and(eq(networkNodesTable.isActive, true), inArray(networkNodesTable.type, ["main", "full", "lite", "rpc", "boost"])));
      endpoints = [...new Set([...nodes.map((node) => node.rpcUrl), ...RPC_ENDPOINTS])];
    }
  } catch {
    // The environment fallbacks remain usable if the optional node catalog is unavailable.
  }

  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      const chainResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const chainPayload = await chainResponse.json() as { result?: string; error?: { message?: string } };
      if (!chainResponse.ok || chainPayload.error) {
        lastError = new Error(chainPayload.error?.message || `RPC responded with ${chainResponse.status}`);
        continue;
      }
      if (chainPayload.result !== EXPECTED_CHAIN_ID) {
        lastError = new Error(`Wrong chain ID: expected ${EXPECTED_CHAIN_ID}, received ${chainPayload.result || "none"}`);
        continue;
      }

      if (method === "eth_chainId") {
        res.status(200).json(chainPayload);
        return;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const payload = await response.json();
      if (response.ok) {
        res.status(200).json(payload);
        return;
      }
      lastError = new Error(`RPC responded with ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  res.status(502).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Configured RPC endpoints are unavailable" },
    id,
    detail: lastError instanceof Error ? lastError.message : undefined,
  });
});

export default router;