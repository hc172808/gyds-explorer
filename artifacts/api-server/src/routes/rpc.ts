import { Router } from "express";
import { db } from "@workspace/db";
import { networkNodesTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const router = Router();
const isHttpEndpoint = (endpoint: string) => /^https?:\/\//i.test(endpoint);
const firstHttpEndpoint = (...values: Array<string | undefined>) =>
  values.find((endpoint): endpoint is string => Boolean(endpoint && isHttpEndpoint(endpoint)));
const REMOTE_RPC_ENDPOINTS = [
  process.env.GYDS_MAINNET_RPC_URL,
  process.env.GYDS_MAINNET_RPC_URL_2,
  firstHttpEndpoint(process.env.GYDS_REMOTE_RPC_URL, process.env.RPC_URL, process.env.VITE_RPC_URL),
  process.env.GYDS_REMOTE_RPC_URL_2,
  process.env.RPC_URL_2,
  firstHttpEndpoint(
    process.env.BOOSTNODE_RPC_URL,
    process.env.VITE_BOOSTNODE_RPC_URL,
    process.env.VITE_RPC_URL_2,
  ),
].filter((endpoint): endpoint is string => Boolean(endpoint))
  .filter(isHttpEndpoint)
  .filter((endpoint, index, endpoints) => endpoints.indexOf(endpoint) === index);
const NETWORK_CHAIN_IDS = {
  mainnet: 198282,
  testnet: 198281,
} as const;
const uniqueHttpEndpoints = (endpoints: Array<string | undefined>) =>
  endpoints
    .filter((endpoint): endpoint is string => Boolean(endpoint))
    .filter(isHttpEndpoint)
    .filter((endpoint, index, all) => all.indexOf(endpoint) === index);
const MAINNET_RPC_ENDPOINTS = uniqueHttpEndpoints([
  ...REMOTE_RPC_ENDPOINTS,
  "http://127.0.0.1:8545",
]);
const TESTNET_RPC_ENDPOINTS = [
  process.env.GYDS_TESTNET_RPC_URL,
  process.env.GYDS_TESTNET_RPC_URL_2,
  ...(process.env.NODE_ENV === "production"
    ? ["http://127.0.0.1:9545"]
    : [
        process.env.GYDS_PRIVATE_TESTNET_RPC_URL,
        process.env.REPLIT_RPC_URL,
        `http://127.0.0.1:${process.env.REPLIT_RPC_PORT || "18545"}`,
        process.env.REPLIT_LITE_RPC_URL,
        "http://127.0.0.1:9545",
      ]),
  process.env.TESTNET_RPC_URL,
  process.env.TESTNET_RPC_URL_2,
].filter((endpoint): endpoint is string => Boolean(endpoint))
  .filter(isHttpEndpoint)
  .filter((endpoint, index, endpoints) => endpoints.indexOf(endpoint) === index);
const DEFAULT_NETWORK = process.env.NODE_ENV === "production" ? "mainnet" : "testnet";
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || 5000);

router.post("/", async (req, res) => {
  const { method, params = [], id = Date.now() } = req.body ?? {};
  const rawNetwork = req.query.network;
  if (rawNetwork !== undefined && rawNetwork !== "mainnet" && rawNetwork !== "testnet") {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32602, message: "Unsupported RPC network" }, id });
    return;
  }
  const network = (rawNetwork ?? DEFAULT_NETWORK) as keyof typeof NETWORK_CHAIN_IDS;
  const expectedChainId = NETWORK_CHAIN_IDS[network];
  const expectedChainHex = `0x${expectedChainId.toString(16)}`;

  if (typeof method !== "string" || !Array.isArray(params)) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid JSON-RPC request" }, id });
    return;
  }

  let endpoints = network === "mainnet" ? MAINNET_RPC_ENDPOINTS : TESTNET_RPC_ENDPOINTS;
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
    } else if (network === "mainnet") {
      const nodes = await db.select({ rpcUrl: networkNodesTable.rpcUrl })
        .from(networkNodesTable)
        .where(and(eq(networkNodesTable.isActive, true), inArray(networkNodesTable.type, ["main", "full", "lite", "rpc", "boost"])));
      // Prefer the local Replit test nodes so an unavailable production
      // endpoint cannot delay or mask the development network.
      // Admin-configured node records take precedence over environment
      // fallbacks so dashboard changes are effective immediately.
      endpoints = uniqueHttpEndpoints([...nodes.map((node) => node.rpcUrl), ...endpoints]);
    }
  } catch {
    // The environment fallbacks remain usable if the optional node catalog is unavailable.
  }

  let lastError: unknown;
  for (const endpoint of endpoints.filter(isHttpEndpoint)) {
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
      if (chainPayload.result !== expectedChainHex) {
        lastError = new Error(`Wrong chain ID: expected ${expectedChainHex}, received ${chainPayload.result || "none"}`);
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