import type { Request, RequestHandler } from "express";

type RatePolicy = {
  id: "rpc" | "auth";
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let nextCleanupAt = 0;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const policies = {
  rpc: {
    id: "rpc",
    limit: positiveInteger(process.env.API_RPC_RATE_LIMIT, 300),
    windowMs: 60_000,
  },
  auth: {
    id: "auth",
    limit: positiveInteger(process.env.API_AUTH_RATE_LIMIT, 20),
    windowMs: 60_000,
  },
} satisfies Record<string, RatePolicy>;

function policyFor(req: Request): RatePolicy | undefined {
  if (req.method !== "POST") return undefined;
  if (req.path === "/api/rpc") return policies.rpc;
  if (/^\/api\/auth\/(?:nonce|verify|session\/nonce|session\/verify)$/.test(req.path)) {
    return policies.auth;
  }
  return undefined;
}

function pruneBuckets(now: number): void {
  if (now < nextCleanupAt) return;
  nextCleanupAt = now + 30_000;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Keep a burst of unique IPs or wallet addresses from growing this map without bound.
  while (buckets.size > 20_000) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

function clientKey(req: Request, policy: RatePolicy): string {
  const forwardedIdentity = req.body?.walletAddress ?? req.body?.address;
  const wallet = typeof forwardedIdentity === "string" ? forwardedIdentity.toLowerCase() : "";
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `${policy.id}:${ip}:${wallet}`;
}

/**
 * Single-process limits for the public RPC proxy and wallet nonce/signature routes.
 * If the API is horizontally scaled, replace this in-memory store with a shared store.
 */
export const apiRequestRateLimit: RequestHandler = (req, res, next) => {
  const policy = policyFor(req);
  if (!policy) {
    next();
    return;
  }

  const now = Date.now();
  pruneBuckets(now);
  const key = clientKey(req, policy);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + policy.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, policy.limit - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  res.setHeader("RateLimit-Limit", String(policy.limit));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));

  if (bucket.count > policy.limit) {
    res.setHeader("Retry-After", String(resetSeconds));
    res.status(429).json({ error: "Too many requests. Try again later." });
    return;
  }

  next();
};
