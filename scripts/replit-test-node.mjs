#!/usr/bin/env node
/**
 * Disposable GYDS JSON-RPC node for Replit development.
 *
 * This is intentionally not a consensus node and must never be used in
 * production. It exists because Replit's dependency firewall blocks the
 * archived Geth version used by the portable development launcher.
 */

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) continue;
  const [key, inlineValue] = argument.slice(2).split("=", 2);
  args.set(key, inlineValue ?? process.argv[++index]);
}

const type = args.get("type") || "rpc";
const port = Number(args.get("port") || (type === "lite" ? 18555 : 18545));
const stateFile = args.get("state") || path.resolve(".replit-node/test-network/state.json");
const chainId = 198282;
const blockPeriodMs = 5000;

if (!["rpc", "lite"].includes(type)) throw new Error(`--type must be rpc or lite; got ${type}`);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);

fs.mkdirSync(path.dirname(stateFile), { recursive: true });
let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch {
  state = { startedAt: Date.now(), genesis: "0x" + "0".repeat(64) };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

const nodeId = crypto.createHash("sha256").update(`gyds-replit-${type}`).digest("hex");
const nodePublicKey = nodeId.repeat(4).slice(0, 128);
const nodePort = type === "lite" ? 30304 : 30303;
const enode = `enode://${nodePublicKey}@127.0.0.1:${nodePort}`;
const chainIdHex = `0x${chainId.toString(16)}`;

function hex(value) {
  return `0x${Math.max(0, Number(value)).toString(16)}`;
}

function currentBlock() {
  return Math.max(1, 1 + Math.floor((Date.now() - state.startedAt) / blockPeriodMs));
}

function blockHash(number) {
  return `0x${crypto.createHash("sha256").update(`gyds-replit-block-${number}`).digest("hex")}`;
}

function block(number, includeTransactions) {
  const hash = blockHash(number);
  return {
    number: hex(number),
    hash,
    parentHash: number > 0 ? blockHash(number - 1) : state.genesis,
    nonce: "0x0000000000000000",
    sha3Uncles: `0x${"0".repeat(64)}`,
    logsBloom: `0x${"0".repeat(512)}`,
    transactionsRoot: `0x${"0".repeat(64)}`,
    stateRoot: `0x${"0".repeat(64)}`,
    receiptsRoot: `0x${"0".repeat(64)}`,
    miner: "0x0000000000000000000000000000000000000001",
    difficulty: "0x1",
    totalDifficulty: hex(number + 1),
    extraData: "0x47594453205265706c69742074657374206e6f6465",
    size: "0x2a0",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    timestamp: hex(Math.floor((state.startedAt + number * blockPeriodMs) / 1000)),
    transactions: includeTransactions ? [] : [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
  };
}

function nodeInfo() {
  return {
    enode,
    id: nodePublicKey,
    name: `Geth/v1.13.15-${type}/replit-test`,
    ip: "127.0.0.1",
    listenAddr: `127.0.0.1:${nodePort}`,
    ports: { discovery: nodePort, listener: nodePort },
    protocols: { eth: { network: chainId } },
  };
}

function rpcResult(method, params) {
  const height = currentBlock();
  switch (method) {
    case "web3_clientVersion":
      return `GydsReplit/${type} v0.1`;
    case "net_version":
      return String(chainId);
    case "net_peerCount":
      return "0x1";
    case "net_listening":
      return true;
    case "eth_chainId":
      return chainIdHex;
    case "eth_blockNumber":
      return hex(height);
    case "eth_syncing":
      return false;
    case "eth_gasPrice":
      return "0x3b9aca00";
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00";
    case "eth_accounts":
      return ["0x0000000000000000000000000000000000000001"];
    case "eth_getBalance":
      return "0x3635c9adc5dea000000000000000";
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_getCode":
      return "0x";
    case "eth_getStorageAt":
      return `0x${"0".repeat(64)}`;
    case "eth_getBlockByNumber": {
      const requested = params?.[0] === "latest" || params?.[0] === "pending"
        ? height
        : Number.parseInt(String(params?.[0] || "0"), 16);
      return block(Number.isFinite(requested) ? Math.min(requested, height) : height, Boolean(params?.[1]));
    }
    case "eth_getBlockByHash":
      return null;
    case "eth_getTransactionByHash":
    case "eth_getTransactionReceipt":
      return null;
    case "eth_getLogs":
      return [];
    case "eth_call":
      return "0x";
    case "eth_estimateGas":
      return "0x5208";
    case "eth_sendRawTransaction":
      return `0x${crypto.createHash("sha256").update(String(params?.[0] || "")).digest("hex")}`;
    case "admin_nodeInfo":
      return nodeInfo();
    case "admin_peers":
      return [];
    case "admin_datadir":
      return path.resolve(".replit-node/test-network", type);
    default:
      return undefined;
  }
}

function handleRpc(payload) {
  const request = Array.isArray(payload) ? payload : [payload];
  const responses = request.map((entry) => {
    const id = entry?.id ?? null;
    if (!entry || entry.jsonrpc !== "2.0" || typeof entry.method !== "string") {
      return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid JSON-RPC request" } };
    }
    const result = rpcResult(entry.method, entry.params || []);
    if (result === undefined) {
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method ${entry.method} not found` } };
    }
    return { jsonrpc: "2.0", id, result };
  });
  return Array.isArray(payload) ? responses : responses[0];
}

const server = http.createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ service: "gyds-replit-test-node", type, chainId }));
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) request.destroy();
  });
  request.on("end", () => {
    try {
      const payload = JSON.parse(body || "{}");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(handleRpc(payload)));
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[replit-test-node] ${type} RPC listening on http://127.0.0.1:${port}`);
  console.log(`[replit-test-node] enode: ${enode}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);