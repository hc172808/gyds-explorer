const DEFAULT_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 3000;

let activeStop = null;

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
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { status: "disconnected", reason: `HTTP ${response.status}` };
    }

    const payload = await response.json();
    if (payload?.error || typeof payload?.result !== "string") {
      return { status: "disconnected", reason: "Invalid JSON-RPC response" };
    }

    const chainId = Number.parseInt(payload.result, 16);
    if (!Number.isSafeInteger(chainId)) {
      return { status: "disconnected", reason: "RPC returned an invalid chain ID" };
    }
    if (chainId !== expectedChainId) {
      return {
        status: "disconnected",
        reason: `Wrong chain ID ${chainId}; expected ${expectedChainId}`,
      };
    }
    return { status: "connected", chainId };
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
      const activeUrls = [...new Set(
        rows
          .filter((node) => node.is_active)
          .map((node) => String(node.rpc_url || "").trim())
          .filter(Boolean),
      )];
      const checks = await Promise.all(activeUrls.map(async (rpcUrl) => [
        rpcUrl,
        await checkRpc(rpcUrl, expectedChainId),
      ]));
      const results = new Map(checks);

      const updates = rows.filter((node) => {
        const result = node.is_active
          ? results.get(String(node.rpc_url || "").trim())
          : null;
        const nextStatus = result?.status || "disconnected";
        return node.status !== nextStatus;
      });

      await Promise.all(updates.map(async (node) => {
        const result = node.is_active
          ? results.get(String(node.rpc_url || "").trim())
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
