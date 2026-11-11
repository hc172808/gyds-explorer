#!/usr/bin/env node
// ============================================================
// GYDS Block Indexer
// ============================================================
// Polls the GYDS RPC node, fetches new blocks + transactions,
// and stores them in PostgreSQL for fast explorer queries.
//
// Configuration (read from ../.env or environment):
//   RPC_URL       — primary RPC endpoint
//   RPC_URL_2     — secondary RPC endpoint (fallback)
//   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
//   POLL_INTERVAL — seconds between polls (default: 5)
//   BATCH_SIZE    — blocks to fetch per cycle (default: 10)
//
// Usage:
//   node indexer.js          (production, via PM2)
//   node --watch indexer.js  (development)
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");
const {
  normalizeRpcUrl,
  assertExpectedChainId,
  advanceIndexedBlock,
} = require("./helpers");

// ---- Config -----------------------------------------------
const EXPECTED_CHAIN_ID = BigInt(
  process.env.GYDS_MAINNET_CHAIN_ID || process.env.GYDS_CHAIN_ID || process.env.VITE_CHAIN_ID || "198282",
);
const ENV_RPC_ENDPOINTS = [
  process.env.GYDS_REMOTE_RPC_URL,
  process.env.RPC_URL,
  process.env.VITE_RPC_URL,
  process.env.GYDS_REMOTE_RPC_URL_2,
  process.env.RPC_URL_2,
  process.env.BOOSTNODE_RPC_URL,
  process.env.VITE_BOOSTNODE_RPC_URL,
  process.env.VITE_RPC_URL_2,
].map(normalizeRpcUrl).filter(Boolean);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "5", 10) * 1000;
const BATCH_SIZE    = parseInt(process.env.BATCH_SIZE    || "10", 10);

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "gyds_explorer",
  user:     process.env.DB_USER     || "gyds_admin",
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ---- Logging -----------------------------------------------
const ts  = () => new Date().toISOString();
const log  = (...a) => console.log( `[${ts()}] [INFO] `, ...a);
const warn = (...a) => console.warn( `[${ts()}] [WARN] `, ...a);
const err  = (...a) => console.error(`[${ts()}] [ERROR]`, ...a);

// ---- State -------------------------------------------------
let rpcEndpoints = [...new Set(ENV_RPC_ENDPOINTS)];
let activeRpc = rpcEndpoints[0] || "";
let lastIndexedBlock = 0;
let isRunning = false;
let nextRpcCatalogWarningAt = 0;
let nextNoRpcWarningAt = 0;
const verifiedChainEndpoints = new Map();

function displayRpcHost(rpcUrl) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "unconfigured RPC";
  }
}

async function refreshRpcEndpoints() {
  let databaseEndpoints = [];
  try {
    const { rows } = await pool.query(`
      SELECT name, rpc_url
      FROM network_nodes
      WHERE is_active = TRUE
        AND type IN ('main', 'full', 'lite', 'rpc', 'boost')
      ORDER BY CASE name
        WHEN 'Explorer Primary RPC' THEN 0
        WHEN 'Explorer Boost Node' THEN 1
        ELSE 2
      END, id ASC
    `);
    databaseEndpoints = rows.map((row) => normalizeRpcUrl(row.rpc_url)).filter(Boolean);
  } catch (error) {
    const now = Date.now();
    if (now >= nextRpcCatalogWarningAt) {
      warn(`Could not read dashboard RPC settings; using .env endpoints: ${error.message}`);
      nextRpcCatalogWarningAt = now + 60_000;
    }
  }

  rpcEndpoints = [...new Set([...databaseEndpoints, ...ENV_RPC_ENDPOINTS])];
  if (!rpcEndpoints.includes(activeRpc)) activeRpc = rpcEndpoints[0] || "";
  for (const endpoint of verifiedChainEndpoints.keys()) {
    if (!rpcEndpoints.includes(endpoint)) verifiedChainEndpoints.delete(endpoint);
  }
  return rpcEndpoints;
}

// ---- RPC helpers -------------------------------------------
async function rpcCall(method, params = []) {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
  const tryFetch = async (url, requestBody = body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    return json.result;
  };

  const candidates = [...new Set([activeRpc, ...rpcEndpoints].filter(Boolean))];
  if (candidates.length === 0) {
    throw new Error("No absolute Mainnet RPC URL is configured. Set one in the admin dashboard or .env.");
  }

  let lastError;
  for (const endpoint of candidates) {
    try {
      const verifiedUntil = verifiedChainEndpoints.get(endpoint) || 0;
      if (verifiedUntil <= Date.now()) {
        const chainHex = await tryFetch(
          endpoint,
          JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
        );
        assertExpectedChainId(chainHex, EXPECTED_CHAIN_ID);
        verifiedChainEndpoints.set(endpoint, Date.now() + 60_000);
      }

      const result = method === "eth_chainId"
        ? `0x${EXPECTED_CHAIN_ID.toString(16)}`
        : await tryFetch(endpoint);
      if (activeRpc !== endpoint) {
        log(`Using Mainnet RPC ${displayRpcHost(endpoint)}`);
      }
      activeRpc = endpoint;
      return result;
    } catch (error) {
      lastError = error;
      warn(`RPC request failed on ${displayRpcHost(endpoint)}: ${error.message}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All configured Mainnet RPC endpoints failed.");
}

function hexToNumber(hex) {
  if (!hex) return null;
  return parseInt(hex, 16);
}

function hexToBigint(hex) {
  if (!hex) return null;
  return BigInt(hex).toString();
}

// ---- Database helpers --------------------------------------
async function getLastIndexedBlock() {
  try {
    const res = await pool.query("SELECT MAX(number) AS max FROM blocks");
    return res.rows[0].max ? parseInt(res.rows[0].max) : 0;
  } catch {
    return 0;
  }
}

async function upsertBlock(b) {
  await pool.query(
    `INSERT INTO blocks
       (number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, transaction_count, size, extra_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (number) DO UPDATE SET
       hash              = EXCLUDED.hash,
       parent_hash       = EXCLUDED.parent_hash,
       timestamp         = EXCLUDED.timestamp,
       miner             = EXCLUDED.miner,
       gas_used          = EXCLUDED.gas_used,
       gas_limit         = EXCLUDED.gas_limit,
       transaction_count = EXCLUDED.transaction_count,
       size              = EXCLUDED.size,
       extra_data        = EXCLUDED.extra_data`,
    [
      hexToNumber(b.number),
      b.hash,
      b.parentHash,
      hexToNumber(b.timestamp),
      b.miner ? b.miner.toLowerCase() : null,
      hexToNumber(b.gasUsed),
      hexToNumber(b.gasLimit),
      b.transactions ? b.transactions.length : 0,
      hexToNumber(b.size),
      b.extraData || null,
    ]
  );
}

async function upsertTransaction(tx, blockNumber) {
  await pool.query(
    `INSERT INTO transactions
       (hash, block_number, from_address, to_address, value, gas, gas_price, input, nonce, transaction_index, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (hash) DO UPDATE SET
       block_number      = EXCLUDED.block_number,
       from_address      = EXCLUDED.from_address,
       to_address        = EXCLUDED.to_address,
       value             = EXCLUDED.value,
       gas               = EXCLUDED.gas,
       gas_price         = EXCLUDED.gas_price,
       nonce             = EXCLUDED.nonce,
       transaction_index = EXCLUDED.transaction_index`,
    [
      tx.hash,
      blockNumber,
      tx.from ? tx.from.toLowerCase() : null,
      tx.to   ? tx.to.toLowerCase()   : null,
      hexToBigint(tx.value),
      hexToNumber(tx.gas),
      hexToBigint(tx.gasPrice),
      tx.input || "0x",
      hexToNumber(tx.nonce),
      hexToNumber(tx.transactionIndex),
      null,
    ]
  );
}

async function upsertAddress(address, tx) {
  if (!address) return;
  const addr = address.toLowerCase();
  await pool.query(
    `INSERT INTO addresses (address, last_seen, updated_at)
     VALUES ($1, NOW(), NOW())
     ON CONFLICT (address) DO UPDATE SET
       last_seen         = NOW(),
       updated_at        = NOW(),
       transaction_count = addresses.transaction_count + 1`,
    [addr]
  );
}

async function recordNetworkStats(blockNumber, gasPrice) {
  await pool.query(
    `INSERT INTO network_stats (block_height, gas_price, recorded_at)
     VALUES ($1, $2, NOW())`,
    [blockNumber, gasPrice ? hexToBigint(gasPrice) : null]
  );
}

// ---- Block indexing ----------------------------------------
async function indexBlock(blockNumber) {
  const hexNum = "0x" + blockNumber.toString(16);

  const block = await rpcCall("eth_getBlockByNumber", [hexNum, true]);
  if (!block) {
    throw new Error(`Block ${blockNumber} was not returned by the RPC.`);
  }

  await upsertBlock(block);

  const txs = Array.isArray(block.transactions) ? block.transactions : [];
  for (const tx of txs) {
    if (typeof tx === "string") continue; // hash-only mode
    const num = hexToNumber(block.number);
    await upsertTransaction(tx, num);
    await upsertAddress(tx.from, tx);
    if (tx.to) await upsertAddress(tx.to, tx);
  }
}

// ---- Main poll loop ----------------------------------------
async function pollOnce() {
  if (isRunning) return;
  isRunning = true;

  try {
    await refreshRpcEndpoints();
    if (rpcEndpoints.length === 0) {
      const now = Date.now();
      if (now >= nextNoRpcWarningAt) {
        warn("No absolute Mainnet RPC URL is configured. Set one in Admin → Nodes or the API server's .env.");
        nextNoRpcWarningAt = now + 60_000;
      }
      return;
    }
    const chainHex = await rpcCall("eth_chainId");
    assertExpectedChainId(chainHex, EXPECTED_CHAIN_ID);
    const latestHex = await rpcCall("eth_blockNumber");
    const latestBlock = hexToNumber(latestHex);

    if (lastIndexedBlock === 0) {
      lastIndexedBlock = await getLastIndexedBlock();
      log(`Resuming from block ${lastIndexedBlock}. Chain head: ${latestBlock}.`);
    }

    if (latestBlock <= lastIndexedBlock) {
      // Nothing new
      return;
    }

    const from = lastIndexedBlock + 1;
    const to   = Math.min(from + BATCH_SIZE - 1, latestBlock);
    log(`Indexing blocks ${from} → ${to} (chain head: ${latestBlock})`);

    for (let n = from; n <= to; n++) {
      try {
        await indexBlock(n);
        lastIndexedBlock = advanceIndexedBlock(lastIndexedBlock, n);
      } catch (e) {
        err(`Failed to index block ${n}: ${e.message}`);
        break; // stop batch on error, retry next poll
      }
    }

    // Record network stats every 10 blocks
    if (lastIndexedBlock > 0 && lastIndexedBlock % 10 === 0) {
      try {
        const gasPrice = await rpcCall("eth_gasPrice");
        await recordNetworkStats(lastIndexedBlock, gasPrice);
      } catch { /* non-fatal */ }
    }

    const behind = latestBlock - lastIndexedBlock;
    if (behind > 0) {
      log(`Indexed up to block ${lastIndexedBlock}. Still ${behind} block(s) behind head.`);
    } else {
      log(`Fully synced at block ${lastIndexedBlock}.`);
    }
  } catch (e) {
    err(`Poll error: ${e.message}`);
  } finally {
    isRunning = false;
  }
}

// ---- Startup -----------------------------------------------
async function main() {
  log("GYDS Block Indexer starting...");
  log(`  Poll interval: ${POLL_INTERVAL / 1000}s`);
  log(`  Batch size:    ${BATCH_SIZE} blocks`);

  // Test DB connection
  try {
    await pool.query("SELECT NOW()");
    log("PostgreSQL connected.");
  } catch (e) {
    err("Failed to connect to PostgreSQL:", e.message);
    process.exit(1);
  }

  // Test RPC
  try {
    await refreshRpcEndpoints();
    if (rpcEndpoints.length === 0) {
      throw new Error("No absolute Mainnet RPC URL is configured.");
    }
    log(`Configured Mainnet RPC hosts: ${rpcEndpoints.map(displayRpcHost).join(", ")}`);
    const chainHex = await rpcCall("eth_chainId");
    assertExpectedChainId(chainHex, EXPECTED_CHAIN_ID);
    const block = await rpcCall("eth_blockNumber");
    log(`RPC connected. Chain head: ${hexToNumber(block)}`);
  } catch (e) {
    err("Failed to connect to RPC:", e.message);
    err("Indexing will remain idle until a reachable chain-198282 RPC is configured.");
  }

  // Run immediately then on interval
  await pollOnce();
  setInterval(pollOnce, POLL_INTERVAL);
}

process.on("SIGTERM", async () => {
  log("Received SIGTERM — shutting down gracefully...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  log("Received SIGINT — shutting down gracefully...");
  await pool.end();
  process.exit(0);
});

main().catch((e) => {
  err("Fatal startup error:", e.message);
  process.exit(1);
});
