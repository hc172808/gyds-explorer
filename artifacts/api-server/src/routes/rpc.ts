import { Router } from "express";

const router = Router();
const RPC_ENDPOINTS = [
  process.env.VITE_RPC_URL || "https://rpc.netlifegy.com",
  process.env.VITE_RPC_URL_2 || "https://boost.netlifegy.com",
];
const EXPECTED_CHAIN_ID = "0x3068a";
const RPC_TIMEOUT_MS = 5000;

router.post("/", async (req, res) => {
  const { method, params = [], id = Date.now() } = req.body ?? {};

  if (typeof method !== "string" || !Array.isArray(params)) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid JSON-RPC request" }, id });
    return;
  }

  let lastError: unknown;
  for (const endpoint of RPC_ENDPOINTS) {
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