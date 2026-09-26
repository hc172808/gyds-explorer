import { Router } from "express";

const router = Router();
const RPC_ENDPOINTS = [
  process.env.RPC_LOCAL_URL || "http://127.0.0.1:8545",
  process.env.VITE_RPC_URL || process.env.RPC_URL || "https://rpc.netlifegy.com",
  process.env.VITE_RPC_URL_2 || process.env.RPC_URL_2 || "https://boost.netlifegy.com",
].filter((endpoint, index, endpoints) => endpoint && endpoints.indexOf(endpoint) === index);
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || 5000);

router.post("/", async (req, res) => {
  const { method, params = [], id = Date.now() } = req.body ?? {};

  if (typeof method !== "string" || !Array.isArray(params)) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid JSON-RPC request" }, id });
    return;
  }

  let lastError: unknown;
  for (const endpoint of RPC_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (response.ok) {
        res.setHeader("X-GYDS-RPC-Endpoint", endpoint);
        res.status(200).json(payload);
        return;
      }
      lastError = new Error(`RPC responded with ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
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