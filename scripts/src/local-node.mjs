#!/usr/bin/env node

/**
 * Replit-local GYDS JSON-RPC gateway.
 *
 * This is intentionally a testing gateway, not a replacement for a synced
 * Geth node. It tries the configured upstream RPCs first and can serve a
 * deterministic mock chain when Replit cannot reach those upstreams.
 */

import http from "node:http";

const args = process.argv.slice(2);
const argumentValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const role = argumentValue("--role") || process.env.NODE_ROLE || "lite";
const defaultPort = role === "rpc" ? 8555 : 8545;
const port = Number(argumentValue("--port") || process.env.PORT || defaultPort);
const host = process.env.RPC_HOST || "0.0.0.0";
const mode = (process.env.RPC_MODE || "auto").toLowerCase();
const fallbackEnabled = !["false", "0", "off", "disabled"].includes(
  (process.env.RPC_MOCK_FALLBACK || "true").toLowerCase(),
);
const timeoutMs = Number(process.env.RPC_TIMEOUT_MS || 1200);
const configuredChainId = Number(process.env.REPLIT_CHAIN_ID || 198281);
const chainId = Number.isSafeInteger(configuredChainId) && configuredChainId > 0 ? configuredChainId : 198281;
const chainIdHex = `0x${chainId.toString(16)}`;
const networkId = String(chainId);
const mockBlockNumber = Number(process.env.MOCK_BLOCK_NUMBER || 123456);
const mockTimestamp = "0x65b2a9c0";
const zeroAddress = "0x0000000000000000000000000000000000000000";
const zeroHash = `0x${"0".repeat(64)}`;
const mockBlockHash = `0x${chainId.toString(16).padStart(64, "0")}`;
const connectionMode = (process.env.GYDS_RPC_MODE || "auto").toLowerCase();
const localUpstreams = [
  process.env.GYDS_LOCAL_RPC_URL,
  process.env.LOCAL_RPC_URL,
  process.env.RPC_LOCAL_URL,
];
const remoteUpstreams = [
  process.env.GYDS_REMOTE_RPC_URL,
  process.env.GYDS_REMOTE_RPC_URL_2,
  process.env.RPC_URL,
  process.env.RPC_URL_2,
  process.env.VITE_RPC_URL,
  process.env.VITE_RPC_URL_2,
];
const configuredUpstreams = [
  ...(connectionMode === "remote" ? [] : localUpstreams),
  ...(connectionMode === "local" ? [] : remoteUpstreams),
]
  .filter((value) => typeof value === "string" && value.trim())
  .map((value) => value.trim())
  .filter((value, index, list) => list.indexOf(value) === index);

if (!["lite", "rpc"].includes(role)) {
  console.error(`NODE_ROLE must be "lite" or "rpc"; received "${role}".`);
  process.exit(1);
}

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`PORT must be a valid TCP port; received "${port}".`);
  process.exit(1);
}

if (!["auto", "upstream", "mock"].includes(mode)) {
  console.error(`RPC_MODE must be "auto", "upstream", or "mock"; received "${mode}".`);
  process.exit(1);
}

let lastSource = mode === "mock" ? "mock" : "unresolved";
let lastUpstream;
let lastUpstreamError;
let requestCount = 0;
const startedAt = Date.now();
const upstreamCompatibility = new Map();
const upstreamRetryAt = new Map();

const jsonResponse = (id, result) => ({
  jsonrpc: "2.0",
  id,
  result,
});

const errorResponse = (id, code, message, data) => ({
  jsonrpc: "2.0",
  id,
  error: {
    code,
    message,
    ...(data === undefined ? {} : { data }),
  },
});

function hex(value) {
  return `0x${Math.max(0, value).toString(16)}`;
}

function mockBlock(number, fullTransactions) {
  const blockNumber = Math.max(0, Math.min(mockBlockNumber, number));
  const hash = blockNumber === mockBlockNumber ? mockBlockHash : zeroHash;
  return {
    number: hex(blockNumber),
    hash,
    parentHash: blockNumber === 0 ? zeroHash : `0x${String(blockNumber - 1).padStart(64, "0")}`,
    nonce: "0x0000000000000000",
    sha3Uncles: zeroHash,
    logsBloom: `0x${"0".repeat(512)}`,
    transactionsRoot: zeroHash,
    stateRoot: zeroHash,
    receiptsRoot: zeroHash,
    miner: zeroAddress,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x475944532d5245504c49542d4d4f434b",
    size: "0x1f4",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    timestamp: mockTimestamp,
    transactions: fullTransactions ? [] : [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
  };
}

function mockResult(method, params) {
  switch (method) {
    case "eth_chainId":
      return chainIdHex;
    case "net_version":
      return networkId;
    case "web3_clientVersion":
      return `GYDS-LocalNode/1.0.0/${role}-mock`;
    case "eth_blockNumber":
      return hex(mockBlockNumber);
    case "eth_syncing":
      return false;
    case "net_peerCount":
      return "0x0";
    case "eth_gasPrice":
      return "0x3b9aca00";
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00";
    case "eth_getBalance":
    case "eth_getStorageAt":
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_getCode":
      return "0x";
    case "eth_getBlockByNumber": {
      const requested = params?.[0];
      if (requested === "latest" || requested === "pending" || requested === "safe" || requested === "finalized") {
        return mockBlock(mockBlockNumber, Boolean(params?.[1]));
      }
      const number = Number.parseInt(String(requested || "0"), 16);
      return Number.isFinite(number) && number <= mockBlockNumber
        ? mockBlock(number, Boolean(params?.[1]))
        : null;
    }
    case "eth_getBlockByHash":
      return params?.[0] === mockBlockHash ? mockBlock(mockBlockNumber, Boolean(params?.[1])) : null;
    case "eth_getBlockTransactionCountByNumber":
    case "eth_getBlockTransactionCountByHash":
      return "0x0";
    case "eth_getTransactionByHash":
    case "eth_getTransactionReceipt":
      return null;
    case "eth_getLogs":
      return [];
    case "eth_call":
      return "0x";
    case "eth_estimateGas":
      return "0x5208";
    case "eth_accounts":
      return [];
    case "eth_mining":
      return false;
    case "eth_hashrate":
      return "0x0";
    case "rpc_modules":
      return { eth: "1.0", net: "1.0", web3: "1.0" };
    default:
      return undefined;
  }
}

async function postUpstream(endpoint, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestUpstream(payload) {
  if (mode === "mock" || configuredUpstreams.length === 0) {
    return null;
  }

  const errors = [];
  for (const endpoint of configuredUpstreams) {
    const retryAt = upstreamRetryAt.get(endpoint) || 0;
    if (retryAt > Date.now()) {
      errors.push(`${endpoint}: retry deferred`);
      continue;
    }

    try {
      if (upstreamCompatibility.get(endpoint) !== true) {
        const probe = await postUpstream(endpoint, {
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: "gyds-compatibility-probe",
        });
        if (!probe.response.ok || probe.body?.result !== chainIdHex) {
          const observed = probe.body?.result || `HTTP ${probe.response.status}`;
          upstreamCompatibility.set(endpoint, false);
          errors.push(`${endpoint}: incompatible chain ID ${observed} (expected ${chainIdHex})`);
          continue;
        }
        upstreamCompatibility.set(endpoint, true);
      }

      const { response, body } = await postUpstream(endpoint, payload);
      if (response.ok && body && typeof body === "object") {
        if (payload.method === "eth_chainId" && body.result !== chainIdHex) {
          upstreamCompatibility.set(endpoint, false);
          errors.push(`${endpoint}: incompatible chain ID ${body.result || "missing"} (expected ${chainIdHex})`);
          continue;
        }
        if (payload.method === "net_version" && body.result !== networkId) {
          upstreamCompatibility.set(endpoint, false);
          errors.push(`${endpoint}: incompatible network ID ${body.result || "missing"} (expected ${networkId})`);
          continue;
        }
        lastSource = "upstream";
        lastUpstream = endpoint;
        lastUpstreamError = undefined;
        return body;
      }
      errors.push(`${endpoint}: HTTP ${response.status}`);
      upstreamRetryAt.set(endpoint, Date.now() + 30_000);
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
      upstreamRetryAt.set(endpoint, Date.now() + 30_000);
    }
  }

  lastUpstreamError = errors.join("; ");
  return null;
}

async function resolveRequest(payload) {
  const upstream = await requestUpstream(payload);
  if (upstream) {
    return { response: upstream, source: "upstream" };
  }

  if (mode === "upstream" || !fallbackEnabled) {
    return {
      response: errorResponse(payload.id ?? null, -32000, "Configured RPC upstreams are unavailable", {
        role,
        upstreams: configuredUpstreams,
        detail: lastUpstreamError,
      }),
      source: "unavailable",
    };
  }

  const result = mockResult(payload.method, payload.params);
  if (result !== undefined) {
    lastSource = "mock";
    return { response: jsonResponse(payload.id ?? null, result), source: "mock" };
  }

  lastSource = "mock";
  return {
    response: errorResponse(payload.id ?? null, -32601, `Mock node does not implement ${payload.method}`),
    source: "mock",
  };
}

async function resolvePayload(payload) {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        response: errorResponse(null, -32600, "Invalid JSON-RPC batch request"),
        source: "mock",
      };
    }
    const resolved = await Promise.all(payload.map((entry) => resolvePayload(entry)));
    return {
      response: resolved.map((entry) => entry.response),
      source: resolved.some((entry) => entry.source === "upstream") ? "upstream" : resolved[0].source,
    };
  }

  if (!payload || payload.jsonrpc !== "2.0" || typeof payload.method !== "string" || !Array.isArray(payload.params ?? [])) {
    return {
      response: errorResponse(payload?.id ?? null, -32600, "Invalid JSON-RPC request"),
      source: "mock",
    };
  }

  return resolveRequest({
    jsonrpc: "2.0",
    method: payload.method,
    params: payload.params ?? [],
    id: payload.id ?? null,
  });
}

function statusPayload() {
  return {
    status: lastSource === "unavailable" ? "degraded" : "ok",
    service: "gyds-local-rpc-gateway",
    role,
    source: lastSource,
    configuredMode: mode,
    mockFallback: fallbackEnabled,
    chainId,
    chainIdHex,
    networkId,
    port,
    upstreams: configuredUpstreams,
    lastUpstream,
    lastUpstreamError,
    requestCount,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  };
}

function sendJson(res, statusCode, body, source = lastSource) {
  const serialized = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(serialized),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "x-gyds-rpc-source": source,
    "x-gyds-node-role": role,
  });
  res.end(serialized);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body exceeds 1 MB."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && (req.url === "/healthz" || req.url === "/status" || req.url === "/")) {
    sendJson(res, 200, statusPayload());
    return;
  }

  if (req.method !== "POST" || req.url !== "/") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await readBody(req);
    const payload = JSON.parse(body);
    requestCount += Array.isArray(payload) ? payload.length : 1;
    const resolved = await resolvePayload(payload);
    sendJson(res, 200, resolved.response, resolved.source);
  } catch (error) {
    sendJson(res, 400, errorResponse(null, -32700, "Parse error", error instanceof Error ? error.message : String(error)), "mock");
  }
});

server.listen(port, host, () => {
  console.log(
    `[local-node] ${role} JSON-RPC gateway listening on http://${host}:${port} ` +
      `(mode=${mode}, fallback=${fallbackEnabled}, upstreams=${configuredUpstreams.length})`,
  );
});

function shutdown(signal) {
  console.log(`[local-node] received ${signal}; shutting down`);
  server.close(() => process.exit(0));
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));