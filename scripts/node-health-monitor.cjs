const DEFAULT_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 3000;

let activeStop = null;

function firstHttpUrl(...values) {
  return values.find((value) => typeof value === "string" && /^https?:\/\//i.test(value));
}

function getExpectedChainId() {
  const configured = Number(
    process.env.GYDS_CHAIN_ID ||
    process.env.CHAIN_ID ||
    process.env.REPLIT_CHAIN_ID ||
    (process.env.NODE_ENV === "production" ? 198282 : 198281),
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : process.env.NODE_ENV === "production" ? 198282 : 198281;
}

function getEnvironmentRpcEndpoints(localChainId) {
  const mode = (
    process.env.GYDS_RPC_MODE ||
    process.env.NODE_CONNECTION_MODE ||
    "auto"
  ).trim().toLowerCase();
  const localRpc = firstHttpUrl(
    process.env.GYDS_LOCAL_RPC_URL,
    process.env.REPLIT_RPC_URL,
    process.env.LOCAL_RPC_URL,
    process.env.RPC_LOCAL_URL,
    "http://127.0.0.1:8545",
  );
  const configuredLocalRpc = firstHttpUrl(
    process.env.GYDS_LOCAL_RPC_URL,
    process.env.REPLIT_RPC_URL,
    process.env.LOCAL_RPC_URL,
    process.env.RPC_LOCAL_URL,
  );
  const remotePrimary = firstHttpUrl(
    process.env.GYDS_REMOTE_RPC_URL,
    process.env.RPC_URL,
    process.env.VITE_RPC_URL,
  );
  const remoteSecondary = firstHttpUrl(
    process.env.GYDS_REMOTE_RPC_URL_2,
    process.env.RPC_URL_2,
    process.env.BOOSTNODE_RPC_URL,
    process.env.VITE_BOOSTNODE_RPC_URL,
    process.env.VITE_RPC_URL_2,
  );
  const endpoints = [];
  if (mode === "local" || mode === "server") {
    endpoints.push({
      name: "Explorer Primary RPC",
      rpcUrl: localRpc,
      expectedChainId: localChainId,
    });
  } else {
    if (remotePrimary) {
      endpoints.push({
        name: "Explorer Primary RPC",
        rpcUrl: remotePrimary,
        expectedChainId: 198282,
      });
    }
    // The RPC proxy can route through a server-local upstream even while
    // the explorer's mainnet RPC setting points at a remote provider.
    if (configuredLocalRpc) {
      endpoints.push({
        name: "Local RPC upstream",
        rpcUrl: configuredLocalRpc,
        expectedChainId: localChainId,
      });
    }
  }
  if (remoteSecondary) {
    endpoints.push({
      name: "Explorer Boost RPC",
      rpcUrl: remoteSecondary,
      expectedChainId: 198282,
    });
  }
  return endpoints.filter((endpoint) => endpoint.rpcUrl);
}

function writeLog(logger, level, fields, message) {
  try {
    logger?.[level]?.(fields, message);
  } catch {
    // Logging must not stop the health monitor.
  }
}

async function checkRpc(rpcUrl, expectedChainId) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rpcUrl);
  } catch {
    return { status: "disconnected", reason: "Invalid RPC URL" };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { status: "disconnected", reason: "RPC health checks require HTTP(S)" };
  }

  try {
    const request = (method) => fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const [chainResponse, blockResponse] = await Promise.all([
      request("eth_chainId"),
      request("eth_blockNumber"),
    ]);
    if (!chainResponse.ok || !blockResponse.ok) {
      const response = !chainResponse.ok ? chainResponse : blockResponse;
      return { status: "disconnected", reason: `HTTP ${response.status}` };
    }

    const [chainPayload, blockPayload] = await Promise.all([
      chainResponse.json(),
      blockResponse.json(),
    ]);
    if (chainPayload?.error || blockPayload?.error ||
        typeof chainPayload?.result !== "string" ||
        typeof blockPayload?.result !== "string") {
      return { status: "disconnected", reason: "Invalid JSON-RPC response" };
    }

    const chainId = Number.parseInt(chainPayload.result, 16);
    const blockNumber = Number.parseInt(blockPayload.result, 16);
    if (!Number.isSafeInteger(chainId)) {
      return { status: "disconnected", reason: "RPC returned an invalid chain ID" };
    }
    if (!Number.isSafeInteger(blockNumber)) {
      return { status: "disconnected", reason: "RPC returned an invalid block number" };
    }
    if (chainId !== expectedChainId) {
      return {
        status: "disconnected",
        reason: `Wrong chain ID ${chainId}; expected ${expectedChainId}`,
      };
    }
    return { status: "connected", chainId, blockNumber };
  } catch (error) {
    const reason = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "RPC timed out"
      : "RPC connection failed";
    return { status: "disconnected", reason };
  }
}

function startNodeHealthMonitor({
  pool,
  logger,
  intervalMs = DEFAULT_INTERVAL_MS,
} = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL pool is required for node health monitoring.");
  }
  if (activeStop) return activeStop;

  const expectedChainId = getExpectedChainId();
  const environmentEndpoints = getEnvironmentRpcEndpoints(expectedChainId);
  const previousEnvironmentStatuses = new Map();
  let checking = false;
  let lastDatabaseErrorAt = 0;

  const checkAllNodes = async () => {
    if (checking) return;
    checking = true;

    try {
      const { rows } = await pool.query(
        `SELECT id, name, rpc_url, status, is_active
         FROM network_nodes
         ORDER BY id`,
      );
      const targets = new Map();
      for (const node of rows.filter((row) => row.is_active)) {
        const rpcUrl = String(node.rpc_url || "").trim();
        if (!rpcUrl) continue;
        const key = `${rpcUrl}\u0000${expectedChainId}`;
        targets.set(key, { rpcUrl, expectedChainId });
      }
      for (const endpoint of environmentEndpoints) {
        const key = `${endpoint.rpcUrl}\u0000${endpoint.expectedChainId}`;
        targets.set(key, {
          rpcUrl: endpoint.rpcUrl,
          expectedChainId: endpoint.expectedChainId,
        });
      }
      const checks = await Promise.all([...targets.entries()].map(async ([key, target]) => [
        key,
        await checkRpc(target.rpcUrl, target.expectedChainId),
      ]));
      const results = new Map(checks);

      const updates = rows.filter((node) => {
        const rpcUrl = String(node.rpc_url || "").trim();
        const result = node.is_active && rpcUrl
          ? results.get(`${rpcUrl}\u0000${expectedChainId}`)
          : null;
        const nextStatus = result?.status || "disconnected";
        return node.status !== nextStatus;
      });

      await Promise.all(updates.map(async (node) => {
        const rpcUrl = String(node.rpc_url || "").trim();
        const result = node.is_active && rpcUrl
          ? results.get(`${rpcUrl}\u0000${expectedChainId}`)
          : null;
        const nextStatus = result?.status || "disconnected";
        await pool.query(
          "UPDATE network_nodes SET status = $1, updated_at = NOW() WHERE id = $2",
          [nextStatus, node.id],
        );
        writeLog(
          logger,
          nextStatus === "connected" ? "info" : "warn",
          {
            nodeId: node.id,
            nodeName: node.name,
            expectedChainId,
            ...(result?.chainId ? { chainId: result.chainId } : {}),
            ...(result?.reason ? { reason: result.reason } : {}),
          },
          `RPC node status changed to ${nextStatus}`,
        );
      }));

      for (const endpoint of environmentEndpoints) {
        const key = `${endpoint.rpcUrl}\u0000${endpoint.expectedChainId}`;
        const result = results.get(key);
        const nextStatus = result?.status || "disconnected";
        const previousStatus = previousEnvironmentStatuses.get(endpoint.name);
        if (previousStatus !== nextStatus) {
          writeLog(
            logger,
            nextStatus === "connected" ? "info" : "warn",
            {
              endpoint: endpoint.name,
              expectedChainId: endpoint.expectedChainId,
              ...(result?.chainId ? { chainId: result.chainId } : {}),
              ...(result?.reason ? { reason: result.reason } : {}),
            },
            `Environment RPC status changed to ${nextStatus}`,
          );
          previousEnvironmentStatuses.set(endpoint.name, nextStatus);
        }
      }
    } catch (error) {
      const now = Date.now();
      if (now - lastDatabaseErrorAt >= 60000) {
        lastDatabaseErrorAt = now;
        writeLog(logger, "warn", { err: error }, "RPC node health check could not read node settings");
      }
    } finally {
      checking = false;
    }
  };

  const timer = setInterval(() => { void checkAllNodes(); }, intervalMs);
  timer.unref?.();
  void checkAllNodes();
  writeLog(logger, "info", { intervalMs, expectedChainId }, "RPC node health monitor started");

  const stop = () => {
    clearInterval(timer);
    activeStop = null;
  };
  activeStop = stop;
  return stop;
}

module.exports = { startNodeHealthMonitor, checkRpc };
