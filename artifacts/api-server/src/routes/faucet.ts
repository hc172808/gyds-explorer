import { Router } from "express";

const router = Router();
const PRIVATE_TESTNET_CHAIN_ID = "0x30689";
const FAUCET_RPC_URL =
  process.env.GYDS_PRIVATE_TESTNET_RPC_URL ||
  process.env.REPLIT_RPC_URL ||
  `http://127.0.0.1:${process.env.REPLIT_RPC_PORT || "18545"}`;
const FAUCET_AMOUNT = "0x3b9aca00"; // 1 native GYDS at 9 decimals
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const GLOBAL_CLAIM_WINDOW_MS = 60 * 60 * 1000;
const MAX_CLAIMS_PER_HOUR = 50;
const claims = new Map<string, number>();
const inFlight = new Set<string>();
const recentClaims: number[] = [];

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(FAUCET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json() as {
    result?: unknown;
    error?: { message?: string };
  };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Local Testnet RPC returned HTTP ${response.status}`);
  }
  return payload.result;
}

router.post("/faucet", async (req, res) => {
  // This faucet is for the isolated Replit development chain only.
  if (process.env.NODE_ENV === "production") {
    res.sendStatus(404);
    return;
  }

  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ error: "Enter a valid EVM wallet address." });
    return;
  }

  const walletKey = address.toLowerCase();
  const now = Date.now();
  const lastClaim = claims.get(walletKey);
  if (lastClaim && now - lastClaim < CLAIM_COOLDOWN_MS) {
    const retryMinutes = Math.ceil((CLAIM_COOLDOWN_MS - (now - lastClaim)) / 60_000);
    res.status(429).json({ error: `This wallet can request more test GYDS in about ${retryMinutes} minutes.` });
    return;
  }
  if (inFlight.has(walletKey)) {
    res.status(429).json({ error: "A test-fund request for this wallet is already processing." });
    return;
  }
  while (recentClaims.length && now - recentClaims[0] >= GLOBAL_CLAIM_WINDOW_MS) {
    recentClaims.shift();
  }
  if (recentClaims.length >= MAX_CLAIMS_PER_HOUR) {
    res.status(429).json({ error: "The private Testnet faucet has reached its hourly request limit. Try again later." });
    return;
  }

  inFlight.add(walletKey);
  try {
    const chainId = await rpc("eth_chainId");
    if (chainId !== PRIVATE_TESTNET_CHAIN_ID) {
      res.status(503).json({ error: "The private Testnet node is not running on chain 198281." });
      return;
    }

    const clientVersion = await rpc("web3_clientVersion");
    if (typeof clientVersion === "string" && clientVersion.startsWith("GydsReplit/")) {
      res.status(503).json({
        error: "The Replit test-node simulator cannot send transactions. Configure GYDS_PRIVATE_TESTNET_RPC_URL to a real unlocked private Testnet node.",
      });
      return;
    }

    const accounts = await rpc("eth_accounts");
    const faucetAddress = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof faucetAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(faucetAddress)) {
      res.status(503).json({ error: "The private Testnet faucet account is unavailable." });
      return;
    }

    const transactionHash = await rpc("eth_sendTransaction", [{
      from: faucetAddress,
      to: address,
      value: FAUCET_AMOUNT,
      gas: "0x5208",
      gasPrice: "0x3b9aca00",
    }]);
    if (typeof transactionHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      res.status(503).json({ error: "The private Testnet node did not return a valid transaction hash." });
      return;
    }

    claims.set(walletKey, now);
    recentClaims.push(now);
    res.json({ amount: "1", symbol: "GYDS", chainId: 198281, transactionHash });
  } catch {
    res.status(503).json({ error: "The local Testnet faucet is unavailable. Check that its node is running, then retry." });
  } finally {
    inFlight.delete(walletKey);
  }
});

export default router;
