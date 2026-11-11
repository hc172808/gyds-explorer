const NODE_TYPES = new Set(["main", "full", "lite", "rpc", "boost", "validator", "boot"]);
const NODE_STATUSES = new Set(["connected", "disconnected"]);
const PUBLIC_FIELDS = "id, name, type, status, is_active";
const ADMIN_FIELDS = "id, name, type, rpc_url, enode, status, is_active, created_at, updated_at";

function mapNode(row, isPublic = false) {
  const node = {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    status: row.status,
    isActive: row.is_active,
  };
  if (!isPublic) {
    node.rpcUrl = row.rpc_url;
    node.enode = row.enode;
    node.createdAt = row.created_at;
    node.updatedAt = row.updated_at;
  }
  return node;
}

function validId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function validRpcUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validEnode(value) {
  return typeof value === "string"
    && /^enode:\/\/[0-9a-fA-F]{128}@[^/\s:]+:\d+(?:\?.*)?$/.test(value.trim())
    && value.trim().length <= 65535;
}

function validateNode(body, partial = false) {
  const values = {};
  if (!partial || "name" in body) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 255) {
      return { error: "name is required and must be at most 255 characters" };
    }
    values.name = body.name.trim();
  }
  if (!partial || "type" in body) {
    if (typeof body.type !== "string" || !NODE_TYPES.has(body.type)) {
      return { error: "Invalid node type" };
    }
    values.type = body.type;
  }
  if (!partial || "rpcUrl" in body) {
    if (!validRpcUrl(body.rpcUrl)) return { error: "rpcUrl must be a valid HTTP(S) URL" };
    values.rpc_url = body.rpcUrl.trim();
  }
  if ("enode" in body) {
    if (body.enode !== null && (typeof body.enode !== "string" || body.enode.length > 65535)) {
      return { error: "enode must be a valid enode URL or null" };
    }
    const enode = typeof body.enode === "string" ? body.enode.trim() : "";
    if (enode && !validEnode(enode)) return { error: "enode must be a valid enode URL" };
    values.enode = enode || null;
  }
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") return { error: "isActive must be a boolean" };
    values.is_active = body.isActive;
  }
  if ("status" in body && (typeof body.status !== "string" || !NODE_STATUSES.has(body.status))) {
    return { error: "status must be connected or disconnected" };
  }
  return { values };
}

async function discoverEnode(rpcUrl) {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "admin_nodeInfo", params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    const enode = payload?.result?.enode;
    if (!response.ok || payload?.error || !validEnode(enode)) {
      return { error: payload?.error?.message || `RPC returned HTTP ${response.status} or no enode` };
    }
    return { enode: enode.trim() };
  } catch {
    return { error: "RPC was unreachable during enode discovery" };
  }
}

function routeError(res, error, message) {
  console.error(`[Network Nodes] ${message}:`, error?.message || error);
  res.status(500).json({ error: message });
}

module.exports = function registerLegacyNodeRoutes({ app, pool, requireAdmin }) {
  app.get("/api/nodes", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${PUBLIC_FIELDS} FROM network_nodes WHERE is_active = TRUE ORDER BY name`,
      );
      res.json(rows.map((row) => mapNode(row, true)));
    } catch (error) {
      routeError(res, error, "Could not load network nodes");
    }
  });

  app.get("/api/nodes/admin", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${ADMIN_FIELDS} FROM network_nodes ORDER BY name`);
      res.json(rows.map((row) => mapNode(row)));
    } catch (error) {
      routeError(res, error, "Could not load network nodes");
    }
  });

  app.get("/api/nodes/runtime-settings", requireAdmin, async (_req, res) => {
    const mode = (
      process.env.GYDS_RPC_MODE ||
      process.env.NODE_CONNECTION_MODE ||
      "auto"
    ).trim().toLowerCase();
    const connectionMode = mode === "local" ? "server" : mode === "remote" ? "remote" : "auto";
    const localRpc = process.env.GYDS_LOCAL_RPC_URL ||
      process.env.REPLIT_RPC_URL ||
      process.env.LOCAL_RPC_URL ||
      process.env.RPC_LOCAL_URL ||
      "http://127.0.0.1:8545";
    const remotePrimary = process.env.GYDS_REMOTE_RPC_URL ||
      process.env.RPC_URL ||
      process.env.VITE_RPC_URL ||
      "";
    const remoteSecondary = process.env.GYDS_REMOTE_RPC_URL_2 ||
      process.env.RPC_URL_2 ||
      process.env.BOOSTNODE_RPC_URL ||
      process.env.VITE_BOOSTNODE_RPC_URL ||
      process.env.VITE_RPC_URL_2 ||
      "";
    res.json({
      primaryRpc: connectionMode === "server" ? localRpc : remotePrimary,
      boostnodeRpc: remoteSecondary,
      bootnodeEnode: process.env.GYDS_BOOTNODE_ENODE || process.env.BOOTNODE_ENODE || "",
      connectionMode,
    });
  });

  app.put("/api/nodes/runtime-settings", requireAdmin, async (req, res) => {
    const primaryRpc = req.body?.primaryRpc;
    const boostnodeRpc = req.body?.boostnodeRpc ?? req.body?.secondaryRpc;
    const bootnodeEnode = req.body?.bootnodeEnode ?? "";
    if (!validRpcUrl(primaryRpc) || !validRpcUrl(boostnodeRpc)) {
      res.status(400).json({ error: "primaryRpc and boostnodeRpc must be valid HTTP(S) URLs" });
      return;
    }
    if (bootnodeEnode && !validEnode(bootnodeEnode)) {
      res.status(400).json({ error: "bootnodeEnode must be a valid enode URL or empty" });
      return;
    }

    const settings = [
      { name: "Explorer Primary RPC", type: "rpc", rpcUrl: primaryRpc.trim(), enode: null, isActive: true },
      { name: "Explorer Boost Node", type: "boost", rpcUrl: boostnodeRpc.trim(), enode: null, isActive: true },
      {
        name: "Explorer Bootnode",
        type: "boot",
        rpcUrl: primaryRpc.trim(),
        enode: bootnodeEnode || null,
        isActive: Boolean(bootnodeEnode),
      },
    ];

    try {
      for (const setting of settings) {
        await pool.query(
          `INSERT INTO network_nodes (name, type, rpc_url, enode, status, is_active, updated_at)
           VALUES ($1, $2, $3, $4, 'disconnected', $5, NOW())
           ON CONFLICT (name) DO UPDATE SET
             type = EXCLUDED.type,
             rpc_url = EXCLUDED.rpc_url,
             enode = EXCLUDED.enode,
             status = 'disconnected',
             is_active = EXCLUDED.is_active,
             updated_at = NOW()`,
          [setting.name, setting.type, setting.rpcUrl, setting.enode, setting.isActive],
        );
      }
      res.json({ success: true, settings });
    } catch (error) {
      routeError(res, error, "Could not save RPC settings");
    }
  });

  app.post("/api/nodes/ping", requireAdmin, async (req, res) => {
    const rpcUrl = req.body?.rpcUrl;
    if (!validRpcUrl(rpcUrl)) {
      res.status(400).json({ ok: false, error: "rpcUrl must be a valid HTTP(S) URL" });
      return;
    }
    const started = Date.now();
    try {
      const request = (method) => fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
        signal: AbortSignal.timeout(5000),
      });
      const [chainResponse, blockResponse] = await Promise.all([
        request("eth_chainId"),
        request("eth_blockNumber"),
      ]);
      const [chain, block] = await Promise.all([chainResponse.json(), blockResponse.json()]);
      if (!chainResponse.ok || !blockResponse.ok || chain?.error || block?.error) {
        res.json({ ok: false, error: chain?.error?.message || block?.error?.message || "RPC request failed" });
        return;
      }
      const chainId = Number.parseInt(chain?.result || "", 16);
      const blockNumber = Number.parseInt(block?.result || "", 16);
      if (!Number.isSafeInteger(chainId) || !Number.isSafeInteger(blockNumber)) {
        res.json({ ok: false, error: "RPC returned an invalid chain ID or block number" });
        return;
      }
      const configuredChainId = Number(
        process.env.GYDS_CHAIN_ID ||
        process.env.CHAIN_ID ||
        process.env.REPLIT_CHAIN_ID ||
        (process.env.NODE_ENV === "production" ? 198282 : 198281),
      );
      const expectedChainId = Number.isSafeInteger(configuredChainId) && configuredChainId > 0
        ? configuredChainId
        : process.env.NODE_ENV === "production" ? 198282 : 198281;
      if (chainId !== expectedChainId) {
        res.json({ ok: false, chainId, error: `Wrong chain ID: expected ${expectedChainId}, received ${chainId}` });
        return;
      }
      res.json({ ok: true, chainId, blockNumber, latencyMs: Date.now() - started });
    } catch {
      res.json({ ok: false, error: "RPC connection failed or timed out" });
    }
  });

  app.post("/api/nodes", requireAdmin, async (req, res) => {
    const result = validateNode(req.body || {});
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    if (result.values.type === "boot" && !result.values.enode) {
      const discovered = await discoverEnode(result.values.rpc_url);
      if (!discovered.enode) {
        res.status(422).json({ error: discovered.error, hint: "Paste an enode URL or enable admin_nodeInfo on a trusted node." });
        return;
      }
      result.values.enode = discovered.enode;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO network_nodes (name, type, rpc_url, enode, status, is_active, updated_at)
         VALUES ($1, $2, $3, $4, 'disconnected', $5, NOW()) RETURNING ${ADMIN_FIELDS}`,
        [
          result.values.name,
          result.values.type,
          result.values.rpc_url,
          result.values.enode || null,
          result.values.is_active ?? true,
        ],
      );
      res.status(201).json(mapNode(rows[0]));
    } catch (error) {
      if (error?.code === "23505") {
        res.status(409).json({ error: "A node with this name already exists" });
        return;
      }
      routeError(res, error, "Could not add network node");
    }
  });

  app.put("/api/nodes/:id", requireAdmin, async (req, res) => {
    const id = validId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid node id" });
      return;
    }
    const result = validateNode(req.body || {}, true);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    if (!Object.keys(result.values).length) {
      res.status(400).json({ error: "At least one node field must be provided" });
      return;
    }
    try {
      const current = await pool.query("SELECT type, rpc_url, enode FROM network_nodes WHERE id = $1", [id]);
      const existing = current.rows[0];
      if (!existing) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      const effectiveType = result.values.type || existing.type;
      const effectiveRpc = result.values.rpc_url || existing.rpc_url;
      if (effectiveType === "boot" && !result.values.enode && !existing.enode) {
        const discovered = await discoverEnode(effectiveRpc);
        if (!discovered.enode) {
          res.status(422).json({ error: discovered.error, hint: "Paste an enode URL or enable admin_nodeInfo on a trusted node." });
          return;
        }
        result.values.enode = discovered.enode;
      }

      const columns = {
        name: "name",
        type: "type",
        rpc_url: "rpc_url",
        enode: "enode",
        is_active: "is_active",
      };
      const values = [];
      const assignments = [];
      for (const [key, column] of Object.entries(columns)) {
        if (!(key in result.values)) continue;
        values.push(result.values[key]);
        assignments.push(`${column} = $${values.length}`);
      }
      values.push(id);
      const { rows } = await pool.query(
        `UPDATE network_nodes
         SET ${assignments.join(", ")}, status = 'disconnected', updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING ${ADMIN_FIELDS}`,
        values,
      );
      if (!rows[0]) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      res.json(mapNode(rows[0]));
    } catch (error) {
      if (error?.code === "23505") {
        res.status(409).json({ error: "A node with this name already exists" });
        return;
      }
      routeError(res, error, "Could not update network node");
    }
  });

  app.put("/api/nodes/:id/toggle", requireAdmin, async (req, res) => {
    const id = validId(req.params.id);
    if (!id || typeof req.body?.isActive !== "boolean") {
      res.status(400).json({ error: "A valid node id and boolean isActive value are required" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE network_nodes
         SET is_active = $1, status = 'disconnected', updated_at = NOW()
         WHERE id = $2
         RETURNING ${ADMIN_FIELDS}`,
        [req.body.isActive, id],
      );
      if (!rows[0]) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      res.json(mapNode(rows[0]));
    } catch (error) {
      routeError(res, error, "Could not change node connection");
    }
  });

  app.delete("/api/nodes/:id", requireAdmin, async (req, res) => {
    const id = validId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid node id" });
      return;
    }
    try {
      const { rowCount } = await pool.query("DELETE FROM network_nodes WHERE id = $1", [id]);
      if (!rowCount) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      routeError(res, error, "Could not remove network node");
    }
  });
};
