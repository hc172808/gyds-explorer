/**
 * GYDS Block Indexer
 * ==================
 * Continuously syncs blocks and transactions from the GYDS RPC
 * into the local PostgreSQL database.
 *
 * Features:
 *   - Catches up from the last indexed block to current head
 *   - Polls for new blocks every few seconds
 *   - Stores blocks, transactions, addresses, and network stats
 *   - Automatic RPC failover between primary and secondary endpoints
 *   - Graceful shutdown on SIGINT/SIGTERM
 *
 * Managed by PM2 in production.
 */

const { Pool } = require("pg");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args)).catch(() => require("node-fetch")(...args));

// Load .env from parent directory
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// ---------- Configuration ----------
const RPC_ENDPOINTS = [
  process.env.VITE_RPC_URL || "https://rpc.netlifegy.com",
  process.env.VITE_RPC_URL_2 || "https://rpc2.netlifegy.com",
].filter(Boolean);

const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_MS || "3000");
const BATCH_SIZE = parseInt(process.env.INDEXER_BATCH_SIZE || "10");
const STATS_INTERVAL_MS = parseInt(process.env.INDEXER_STATS_MS || "60000");

let currentRpcIndex = 0;
let running = true;

// ---------- Database ----------
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "gyds_explorer",
  user: process.env.DB_USER || "gyds_admin",
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

// ---------- Helpers ----------
const hexToNumber = (hex) => parseInt(hex, 16);
const log = (msg) => console.log(`[${new Date().toISOString()}] [INDEXER] ${msg}`);
const warn = (msg) => console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`);
const err = (msg) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`);

// ---------- RPC ----------
async function rpcCall(method, params = []) {
  const maxRetries = RPC_ENDPOINTS.length;
  for (let i = 0; i < maxRetries; i++) {
    const url = RPC_ENDPOINTS[(currentRpcIndex + i) % RPC_ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
        timeout: 10000,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (e) {
      warn(`RPC ${url} failed for ${method}: ${e.message}`);
      if (i === maxRetries - 1) throw e;
      currentRpcIndex = (currentRpcIndex + 1) % RPC_ENDPOINTS.length;
    }
  }
}

async function getLatestBlockNumber() {
  const hex = await rpcCall("eth_blockNumber");
  return hexToNumber(hex);
}

async function getBlockByNumber(num, full = true) {
  const hex = "0x" + num.toString(16);
  return rpcCall("eth_getBlockByNumber", [hex, full]);
}

async function getTransactionReceipt(hash) {
  return rpcCall("eth_getTransactionReceipt", [hash]);
}

async function getBalance(address) {
  return rpcCall("eth_getBalance", [address, "latest"]);
}

async function getCode(address) {
  return rpcCall("eth_getCode", [address, "latest"]);
}

async function getNetworkStats() {
  const [blockNumber, gasPrice, chainId, peerCount] = await Promise.all([
    rpcCall("eth_blockNumber"),
    rpcCall("eth_gasPrice"),
    rpcCall("eth_chainId"),
    rpcCall("net_peerCount").catch(() => "0x0"),
  ]);
  return {
    blockHeight: hexToNumber(blockNumber),
    gasPrice: gasPrice,
    chainId: hexToNumber(chainId),
    peerCount: hexToNumber(peerCount),
  };
}

// ---------- Database Operations ----------
async function getLastIndexedBlock() {
  const result = await pool.query("SELECT MAX(number) as last_block FROM blocks");
  return result.rows[0].last_block || 0;
}

async function saveBlock(block) {
  const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
  await pool.query(
    `INSERT INTO blocks (number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, transaction_count, size, extra_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (number) DO UPDATE SET
       hash=EXCLUDED.hash, parent_hash=EXCLUDED.parent_hash, timestamp=EXCLUDED.timestamp,
       miner=EXCLUDED.miner, gas_used=EXCLUDED.gas_used, gas_limit=EXCLUDED.gas_limit,
       transaction_count=EXCLUDED.transaction_count, size=EXCLUDED.size, extra_data=EXCLUDED.extra_data`,
    [
      hexToNumber(block.number),
      block.hash,
      block.parentHash,
      hexToNumber(block.timestamp),
      block.miner,
      hexToNumber(block.gasUsed),
      hexToNumber(block.gasLimit),
      txCount,
      hexToNumber(block.size || "0x0"),
      block.extraData || "",
    ]
  );
}

async function saveTransaction(tx, receipt) {
  const status = receipt ? hexToNumber(receipt.status) : -1;
  await pool.query(
    `INSERT INTO transactions (hash, block_number, from_address, to_address, value, gas, gas_price, input, nonce, transaction_index, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (hash) DO UPDATE SET
       status=EXCLUDED.status, block_number=EXCLUDED.block_number`,
    [
      tx.hash,
      hexToNumber(tx.blockNumber),
      tx.from ? tx.from.toLowerCase() : "",
      tx.to ? tx.to.toLowerCase() : null,
      tx.value || "0x0",
      hexToNumber(tx.gas || "0x0"),
      tx.gasPrice || "0x0",
      tx.input && tx.input.length > 10000 ? tx.input.substring(0, 10000) : tx.input || "0x",
      hexToNumber(tx.nonce || "0x0"),
      hexToNumber(tx.transactionIndex || "0x0"),
      status,
    ]
  );
}

async function upsertAddress(address, isContract = false) {
  if (!address) return;
  const addr = address.toLowerCase();
  try {
    const balance = await getBalance(addr).catch(() => "0x0");
    await pool.query(
      `INSERT INTO addresses (address, balance, transaction_count, is_contract, last_seen, updated_at)
       VALUES ($1, $2, 1, $3, NOW(), NOW())
       ON CONFLICT (address) DO UPDATE SET
         balance = $2,
         transaction_count = addresses.transaction_count + 1,
         is_contract = CASE WHEN $3 THEN TRUE ELSE addresses.is_contract END,
         last_seen = NOW(),
         updated_at = NOW()`,
      [addr, balance, isContract]
    );
  } catch (e) {
    warn(`Failed to upsert address ${addr}: ${e.message}`);
  }
}

async function saveNetworkStats(stats) {
  await pool.query(
    `INSERT INTO network_stats (block_height, gas_price, peer_count, chain_id)
     VALUES ($1,$2,$3,$4)`,
    [stats.blockHeight, stats.gasPrice, stats.peerCount, stats.chainId]
  );
}

// ---------- Indexing Logic ----------
async function indexBlock(blockNum) {
  const block = await getBlockByNumber(blockNum, true);
  if (!block) {
    warn(`Block ${blockNum} returned null, skipping.`);
    return;
  }

  await saveBlock(block);

  // Index transactions
  if (Array.isArray(block.transactions)) {
    for (const tx of block.transactions) {
      if (typeof tx === "object") {
        try {
          const receipt = await getTransactionReceipt(tx.hash).catch(() => null);
          await saveTransaction(tx, receipt);

          // Upsert addresses (don't await to avoid slowing down)
          const contractCreated = receipt && receipt.contractAddress;
          upsertAddress(tx.from, false);
          if (tx.to) upsertAddress(tx.to, false);
          if (contractCreated) upsertAddress(receipt.contractAddress, true);
        } catch (e) {
          warn(`Failed to index tx ${tx.hash}: ${e.message}`);
        }
      }
    }
  }
}

async function catchUp() {
  const lastIndexed = await getLastIndexedBlock();
  const latestOnChain = await getLatestBlockNumber();

  if (lastIndexed >= latestOnChain) {
    return latestOnChain;
  }

  const startBlock = lastIndexed + 1;
  const endBlock = Math.min(startBlock + BATCH_SIZE - 1, latestOnChain);
  const total = latestOnChain - lastIndexed;

  log(`Catching up: blocks ${startBlock} → ${endBlock} (${total} behind)`);

  for (let i = startBlock; i <= endBlock && running; i++) {
    try {
      await indexBlock(i);
      if ((i - startBlock + 1) % 5 === 0) {
        log(`  Indexed block ${i} (${i - startBlock + 1}/${endBlock - startBlock + 1})`);
      }
    } catch (e) {
      err(`Failed to index block ${i}: ${e.message}`);
      // Wait a bit before retrying
      await sleep(2000);
    }
  }

  return endBlock;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Main Loop ----------
async function main() {
  log("=== GYDS Block Indexer Starting ===");
  log(`RPC endpoints: ${RPC_ENDPOINTS.join(", ")}`);
  log(`Poll interval: ${POLL_INTERVAL_MS}ms | Batch size: ${BATCH_SIZE}`);

  // Test database connection
  try {
    await pool.query("SELECT NOW()");
    log("Database connected successfully.");
  } catch (e) {
    err(`Database connection failed: ${e.message}`);
    process.exit(1);
  }

  // Test RPC connection
  try {
    const latest = await getLatestBlockNumber();
    log(`RPC connected. Latest block: ${latest}`);
  } catch (e) {
    err(`RPC connection failed: ${e.message}`);
    process.exit(1);
  }

  const lastIndexed = await getLastIndexedBlock();
  log(`Last indexed block in DB: ${lastIndexed}`);

  // Stats recording interval
  let statsTimer = setInterval(async () => {
    if (!running) return;
    try {
      const stats = await getNetworkStats();
      await saveNetworkStats(stats);
      log(`Network stats recorded: block ${stats.blockHeight}, ${stats.peerCount} peers`);
    } catch (e) {
      warn(`Failed to record network stats: ${e.message}`);
    }
  }, STATS_INTERVAL_MS);

  // Main indexing loop
  while (running) {
    try {
      const lastProcessed = await catchUp();
      const latest = await getLatestBlockNumber();

      if (lastProcessed >= latest) {
        // We're caught up, wait for new blocks
        await sleep(POLL_INTERVAL_MS);
      } else {
        // More blocks to catch up, continue immediately
        await sleep(100);
      }
    } catch (e) {
      err(`Main loop error: ${e.message}`);
      await sleep(5000);
    }
  }

  clearInterval(statsTimer);
  await pool.end();
  log("=== Indexer stopped gracefully ===");
}

// ---------- Graceful Shutdown ----------
process.on("SIGINT", () => {
  log("Received SIGINT, shutting down...");
  running = false;
});
process.on("SIGTERM", () => {
  log("Received SIGTERM, shutting down...");
  running = false;
});

main().catch((e) => {
  err(`Fatal error: ${e.message}`);
  process.exit(1);
});
