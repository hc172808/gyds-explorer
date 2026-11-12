import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Interface } from "ethers";
import { Router } from "express";
import { db } from "@workspace/db";
import { faucetClaimsTable } from "@workspace/db/schema";

const router = Router();
const TESTNET_CHAIN_ID = "0x30689";
const FAUCET_RPC_URL = process.env.GYDS_TESTNET_FAUCET_RPC_URL
  || (process.env.NODE_ENV === "production"
    ? "http://127.0.0.1:9545"
    : process.env.GYDS_PRIVATE_TESTNET_RPC_URL
      || process.env.REPLIT_RPC_URL
      || `http://127.0.0.1:${process.env.REPLIT_RPC_PORT || "18545"}`);
const TGYD_TOKEN_ADDRESS = process.env.GYDS_TESTNET_TGYD_TOKEN_ADDRESS || "";
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RESERVATION_TTL_MS = 10 * 60 * 1000;
const GLOBAL_CLAIM_WINDOW_MS = 60 * 60 * 1000;
const MAX_CLAIMS_PER_HOUR = 50;
const NATIVE_CLAIM_AMOUNT = 100n * 10n ** 18n;
const CLAIM_GAS_PRICE_FALLBACK = 1_000_000_000n;
const TGYD_INTERFACE = new Interface([
  "function symbol() view returns (string)",
  "function claimFaucet(address recipient)",
]);
const inFlight = new Set<string>();
const recentClaims: number[] = [];

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(FAUCET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json() as {
    result?: unknown;
    error?: { message?: string };
  };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Testnet faucet RPC returned HTTP ${response.status}`);
  }
  return payload.result;
}

async function reserveDailyClaim(walletAddress: string, now: Date) {
  const reservationId = randomUUID();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`testnet-faucet:${walletAddress}`}))`);
    const [existing] = await tx.select()
      .from(faucetClaimsTable)
      .where(and(
        eq(faucetClaimsTable.network, "testnet"),
        eq(faucetClaimsTable.walletAddress, walletAddress),
      ))
      .limit(1)
      .for("update");

    if (existing?.reservationId && existing.reservedAt && now.getTime() - existing.reservedAt.getTime() < RESERVATION_TTL_MS) {
      return { state: "busy" as const, reservationId: null, retryAt: new Date(existing.reservedAt.getTime() + RESERVATION_TTL_MS) };
    }
    if (existing?.lastClaimAt && now.getTime() - existing.lastClaimAt.getTime() < CLAIM_COOLDOWN_MS) {
      return { state: "cooldown" as const, reservationId: null, retryAt: new Date(existing.lastClaimAt.getTime() + CLAIM_COOLDOWN_MS) };
    }

    if (existing) {
      await tx.update(faucetClaimsTable)
        .set({ reservationId, reservedAt: now, updatedAt: now })
        .where(and(
          eq(faucetClaimsTable.network, "testnet"),
          eq(faucetClaimsTable.walletAddress, walletAddress),
        ));
    } else {
      await tx.insert(faucetClaimsTable).values({
        network: "testnet",
        walletAddress,
        reservationId,
        reservedAt: now,
        updatedAt: now,
      });
    }
    return { state: "reserved" as const, reservationId, retryAt: null };
  });
}

async function finishClaim(walletAddress: string, reservationId: string, claimedAt?: Date) {
  await db.update(faucetClaimsTable)
    .set({
      ...(claimedAt ? { lastClaimAt: claimedAt } : {}),
      reservationId: null,
      reservedAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(faucetClaimsTable.network, "testnet"),
      eq(faucetClaimsTable.walletAddress, walletAddress),
      eq(faucetClaimsTable.reservationId, reservationId),
    ));
}

function validTxHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

router.post("/faucet", async (req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.GYDS_TESTNET_FAUCET_ENABLED !== "true") {
    res.status(503).json({ error: "The Testnet faucet is disabled by the server operator." });
    return;
  }

  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ error: "Enter a valid EVM wallet address." });
    return;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(TGYD_TOKEN_ADDRESS)) {
    res.status(503).json({ error: "The Testnet TGYD contract address has not been configured on the API server." });
    return;
  }

  const walletKey = address.toLowerCase();
  if (inFlight.has(walletKey)) {
    res.status(429).json({ error: "A faucet claim for this wallet is already processing." });
    return;
  }
  const nowMs = Date.now();
  while (recentClaims.length && nowMs - recentClaims[0] >= GLOBAL_CLAIM_WINDOW_MS) {
    recentClaims.shift();
  }
  if (recentClaims.length >= MAX_CLAIMS_PER_HOUR) {
    res.status(429).json({ error: "The Testnet faucet has reached its hourly request limit. Try again later." });
    return;
  }

  inFlight.add(walletKey);
  let reservationId: string | null = null;
  let anyTransactionSent = false;
  let claimFinalized = false;
  try {
    const reservation = await reserveDailyClaim(walletKey, new Date());
    if (reservation.state !== "reserved" || !reservation.reservationId) {
      const retryMs = reservation.retryAt ? Math.max(0, reservation.retryAt.getTime() - Date.now()) : 60_000;
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryMs / 1000))));
      res.status(429).json({
        error: reservation.state === "busy"
          ? "A faucet claim for this wallet is already processing."
          : `This wallet can claim again in about ${Math.ceil(retryMs / 60_000)} minutes.`,
      });
      return;
    }
    reservationId = reservation.reservationId;

    const chainId = await rpc("eth_chainId");
    if (chainId !== TESTNET_CHAIN_ID) {
      throw new Error("The faucet RPC is not on Testnet chain 198281.");
    }

    const clientVersion = await rpc("web3_clientVersion");
    if (typeof clientVersion === "string" && clientVersion.startsWith("GydsReplit/")) {
      throw new Error("The Replit test-node simulator cannot send transactions. Configure GYDS_TESTNET_FAUCET_RPC_URL to a real private Testnet node.");
    }

    const accounts = await rpc("eth_accounts");
    const faucetAddress = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof faucetAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(faucetAddress)) {
      throw new Error("The private Testnet faucet account is unavailable or is not unlocked on the local node.");
    }

    const symbolData = await rpc("eth_call", [{
      to: TGYD_TOKEN_ADDRESS,
      data: TGYD_INTERFACE.encodeFunctionData("symbol"),
    }, "latest"]);
    if (typeof symbolData !== "string" || TGYD_INTERFACE.decodeFunctionResult("symbol", symbolData)[0] !== "TGYD") {
      throw new Error("The configured Testnet token contract is not TGYD.");
    }

    const tokenClaimData = TGYD_INTERFACE.encodeFunctionData("claimFaucet", [address]);
    try {
      await rpc("eth_call", [{
        from: faucetAddress,
        to: TGYD_TOKEN_ADDRESS,
        data: tokenClaimData,
      }, "latest"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/cooldown/i.test(message)) {
        throw new Error("This wallet has already claimed TGYD in the past 24 hours.");
      }
      if (/cap|supply/i.test(message)) {
        throw new Error("The TGYD faucet supply is exhausted. Claims are paused until the Testnet operator refills it.");
      }
      throw new Error("The TGYD faucet contract is not ready to issue a claim.");
    }

    const [balanceHex, gasPriceHex] = await Promise.all([
      rpc("eth_getBalance", [faucetAddress, "latest"]),
      rpc("eth_gasPrice"),
    ]);
    const faucetBalance = typeof balanceHex === "string" ? BigInt(balanceHex) : 0n;
    const gasPrice = typeof gasPriceHex === "string" && /^0x[0-9a-f]+$/i.test(gasPriceHex)
      ? BigInt(gasPriceHex)
      : CLAIM_GAS_PRICE_FALLBACK;
    const estimatedNativeReserve = NATIVE_CLAIM_AMOUNT + gasPrice * 200_000n;
    if (faucetBalance < estimatedNativeReserve) {
      throw new Error("The Testnet faucet's TGYDS reserve is exhausted or too low to cover claim gas. Claims are paused.");
    }

    const nativeTransactionHash = await rpc("eth_sendTransaction", [{
      from: faucetAddress,
      to: address,
      value: `0x${NATIVE_CLAIM_AMOUNT.toString(16)}`,
      gas: "0x5208",
      gasPrice: `0x${gasPrice.toString(16)}`,
    }]);
    if (!validTxHash(nativeTransactionHash)) {
      throw new Error("The Testnet node did not return a valid TGYDS transaction hash.");
    }
    anyTransactionSent = true;

    let tgydTransactionHash: string | null = null;
    let warning: string | undefined;
    try {
      const tokenHash = await rpc("eth_sendTransaction", [{
        from: faucetAddress,
        to: TGYD_TOKEN_ADDRESS,
        data: tokenClaimData,
        gas: "0x186a0",
        gasPrice: `0x${gasPrice.toString(16)}`,
      }]);
      if (!validTxHash(tokenHash)) throw new Error("The Testnet node did not return a valid TGYD transaction hash.");
      tgydTransactionHash = tokenHash;
    } catch {
      warning = "100 TGYDS was sent, but the TGYD transaction failed. The daily claim is used; contact the Testnet operator.";
    }

    await finishClaim(walletKey, reservationId, new Date());
    claimFinalized = true;
    reservationId = null;
    recentClaims.push(Date.now());
    res.json({
      nativeAmount: "100",
      nativeSymbol: "TGYDS",
      nativeTransactionHash,
      tgydAmount: tgydTransactionHash ? "100" : "0",
      tgydSymbol: "TGYD",
      tgydTransactionHash,
      chainId: 198281,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    if (reservationId && !claimFinalized) {
      await finishClaim(walletKey, reservationId, anyTransactionSent ? new Date() : undefined).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "The Testnet faucet is unavailable.";
    const status = /already claimed/i.test(message) ? 429 : 503;
    if (anyTransactionSent) recentClaims.push(Date.now());
    res.status(status).json({ error: message });
  } finally {
    inFlight.delete(walletKey);
  }
});

export default router;
