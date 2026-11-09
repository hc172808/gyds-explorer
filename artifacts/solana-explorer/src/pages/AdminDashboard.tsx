import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Shield, UserPlus, Trash2, Wallet, Loader2,
  CheckCircle, XCircle, RefreshCw, Settings, Network,
  Server, Wifi, WifiOff, Copy, RotateCcw, Save, Activity,
  Coins, Plus, ExternalLink, ChevronDown, ChevronUp, Zap, AlertCircle,
  CalendarClock, Clock3,
} from "lucide-react";
import { useTokenDeploy, fetchTokenBalances, type DeployResult } from "@/lib/useTokenDeploy";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { API_BASE_URL, getStoredToken } from "@/lib/featureGateApi";
import { getStoredSession, isPrivilegedSession } from "@/lib/session";
import WalletLoginDialog from "@/components/WalletLoginDialog";
import { useNetwork } from "@/contexts/NetworkContext";
import {
  createNetworkNode,
  deleteNetworkNode,
  fetchAdminNetworkNodes,
  fetchCoinSettings,
  fetchNetworkNodes,
  fetchRuntimeNodeSettings,
  pingNetworkNode,
  proxyRpcUrl,
  saveRuntimeNodeSettings,
  toggleNetworkNode,
  updateNetworkNode,
  updateCoinSetting,
  type CoinSetting,
  type NetworkNode,
  type NetworkNodeType,
} from "@/lib/networkApi";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { fetchAutoUpdateSettings, saveAutoUpdateSettings, type AutoUpdateSettings } from "@/lib/systemSettingsApi";
import RpcStatusPanel from "@/components/RpcStatusPanel";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, isAddress, parseUnits } from "ethers";
import { GYDS_CHAIN_HEX, GYDS_CHAIN_ID } from "@/lib/useTokenDeploy";

const API_BASE = API_BASE_URL;

type Tab = "wallets" | "node" | "nodes" | "coins" | "tokens" | "updates";
type RpcConnectionMode = "auto" | "server" | "remote";

const RPC_CONNECTION_MODE_KEY = "gyds_rpc_connection_mode";

function storedRpcConnectionMode(fallback: RpcConnectionMode = "auto"): RpcConnectionMode {
  try {
    const value = localStorage.getItem(RPC_CONNECTION_MODE_KEY);
    return value === "server" || value === "remote" || value === "auto" ? value : fallback;
  } catch {
    return fallback;
  }
}

interface AdminWallet {
  id: number;
  walletAddress: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RpcStatus {
  ok: boolean;
  blockNumber?: number;
  latencyMs?: number;
  error?: string;
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function pingRpc(url: string): Promise<RpcStatus> {
  return pingNetworkNode(url);
}

// ── Node Settings Tab ─────────────────────────────────────────────────────────
function NodeSettingsTab() {
  const { primaryRpc, secondaryRpc, bootnodeEnode, setBootnodeEnode, resetToDefaults } = useNetwork();

  const [rpc1,  setRpc1]  = useState(primaryRpc);
  const [rpc2,  setRpc2]  = useState(secondaryRpc);
  const [boot,  setBoot]  = useState(bootnodeEnode);
  const [connectionMode, setConnectionMode] = useState<RpcConnectionMode>(storedRpcConnectionMode);
  const [savedSettings, setSavedSettings] = useState({
    primaryRpc,
    boostnodeRpc: secondaryRpc,
    bootnodeEnode,
    connectionMode: storedRpcConnectionMode(),
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [status1, setStatus1] = useState<RpcStatus | null>(null);
  const [status2, setStatus2] = useState<RpcStatus | null>(null);
  const [pinging, setPinging] = useState(false);
  const [configuredNodes, setConfiguredNodes] = useState<NetworkNode[]>([]);

  const loadConfiguredNodes = useCallback(async () => {
    try {
      const [runtimeSettings, loaded] = await Promise.all([
        fetchRuntimeNodeSettings(),
        fetchAdminNetworkNodes(),
      ]);
      setConfiguredNodes(loaded);
      const primary = loaded.find((node) => node.name === "Explorer Primary RPC");
      const secondary = loaded.find((node) => node.name === "Explorer Boost Node" || node.name === "Explorer Secondary RPC");
      const bootnode = loaded.find((node) => node.name === "Explorer Bootnode");
      const next = {
        primaryRpc: primary?.rpcUrl || runtimeSettings.primaryRpc,
        boostnodeRpc: secondary?.rpcUrl || runtimeSettings.boostnodeRpc,
        bootnodeEnode: bootnode?.enode || runtimeSettings.bootnodeEnode,
        connectionMode: storedRpcConnectionMode(runtimeSettings.connectionMode),
      };
      setRpc1(next.primaryRpc);
      setRpc2(next.boostnodeRpc);
      setBoot(next.bootnodeEnode);
      setConnectionMode(next.connectionMode);
      setSavedSettings(next);
    } catch {
      // Keep proxy-only defaults if authenticated settings are unavailable.
    }
  }, []);

  useEffect(() => { loadConfiguredNodes(); }, [loadConfiguredNodes]);

  const envConnectionMode = connectionMode === "server" ? "local" : connectionMode;
  const localRpcForEnv = connectionMode === "server" ? rpc1 : "http://127.0.0.1:8545";
  const remoteRpcForEnv = connectionMode === "server" ? rpc2 : rpc1;
  const remoteFallbackForEnv = connectionMode === "server" ? "" : rpc2;
  const ENV_SNIPPET = `# ── GYDS Node / RPC Configuration ──────────────────
GYDS_RPC_MODE=${envConnectionMode}
GYDS_LOCAL_RPC_URL=${localRpcForEnv}
GYDS_REMOTE_RPC_URL=${remoteRpcForEnv}
GYDS_REMOTE_RPC_URL_2=${remoteFallbackForEnv}
VITE_RPC_URL=/api/rpc
VITE_RPC_URL_2=/api/rpc
VITE_BOOSTNODE_RPC_URL=/api/rpc${boot ? `

# ── Bootnode (add to static-nodes.json on your geth node)
BOOTNODE_ENODE=${boot}` : ""}`;
  const NODE_ENV_SNIPPET = configuredNodes.length
    ? `${ENV_SNIPPET}

# ── Server-side node catalog (managed in Admin → Nodes) ─────────
${configuredNodes.map((node) => [
  `GYDS_NODE_${node.id}_NAME=${node.name}`,
  `GYDS_NODE_${node.id}_TYPE=${node.type}`,
  `GYDS_NODE_${node.id}_RPC_URL=${node.rpcUrl}`,
  `GYDS_NODE_${node.id}_STATUS=${node.status}`,
  `GYDS_NODE_${node.id}_ACTIVE=${node.isActive}`,
  node.enode ? `GYDS_NODE_${node.id}_ENODE=${node.enode}` : "",
].filter(Boolean).join("\n")).join("\n\n")}`
    : ENV_SNIPPET;

  const STATIC_NODES = boot
    ? `[\n  "${boot}"\n]`
    : "[]";

  useEffect(() => {
    setDirty(
      rpc1 !== savedSettings.primaryRpc
      || rpc2 !== savedSettings.boostnodeRpc
      || boot !== savedSettings.bootnodeEnode
      || connectionMode !== savedSettings.connectionMode,
    );
  }, [rpc1, rpc2, boot, connectionMode, savedSettings]);

  const save = async () => {
    setSaving(true);
    try {
      await saveRuntimeNodeSettings({ primaryRpc: rpc1.trim(), boostnodeRpc: rpc2.trim(), bootnodeEnode: boot.trim() });
      setBootnodeEnode(boot.trim());
      try {
        localStorage.setItem(RPC_CONNECTION_MODE_KEY, connectionMode);
      } catch {
        /* ignore */
      }
      await loadConfiguredNodes();
      setDirty(false);
      toast.success("Node settings saved", { description: "RPC and bootnode settings are persisted; the selected connection mode is included in the .env snippet." });
    } catch (error) {
      toast.error("Could not save node settings", { description: error instanceof Error ? error.message : "Request failed" });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    resetToDefaults();
    try {
      localStorage.removeItem(RPC_CONNECTION_MODE_KEY);
    } catch {
      /* ignore */
    }
    try {
      const defaults = await fetchRuntimeNodeSettings();
      setRpc1(defaults.primaryRpc);
      setRpc2(defaults.boostnodeRpc);
      setBoot(defaults.bootnodeEnode);
      setConnectionMode(defaults.connectionMode);
      toast("Loaded server environment defaults");
    } catch {
      toast.error("Could not load server defaults");
    }
  };

  const testConnections = useCallback(async () => {
    setPinging(true);
    setStatus1(null);
    setStatus2(null);
    const [s1, s2] = await Promise.all([
      pingRpc(rpc1.trim()),
      pingRpc(rpc2.trim()),
    ]);
    setStatus1(s1);
    setStatus2(s2);
    setPinging(false);
  }, [rpc1, rpc2]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${label}`));
  };

  const RpcStatusBadge = ({ s }: { s: RpcStatus | null }) => {
    if (!s) return null;
    return s.ok ? (
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        <Wifi className="w-3 h-3" /> {s.latencyMs}ms · block {s.blockNumber?.toLocaleString()}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <WifiOff className="w-3 h-3" /> {s.error}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <RpcStatusPanel />

      {/* RPC Endpoints */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" /> RPC Endpoints
          </h2>
          <Button variant="outline" size="sm" onClick={testConnections} disabled={pinging} className="gap-1.5 text-xs h-7">
            {pinging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
            Test connections
          </Button>
        </div>

        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <label className="mb-1.5 block text-xs font-medium">Connection target</label>
          <select
            value={connectionMode}
            onChange={(event) => setConnectionMode(event.target.value as RpcConnectionMode)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="auto">Automatic — this server first, then remote fallbacks</option>
            <option value="server">This server — use the local node only</option>
            <option value="remote">Remote nodes — use the configured public RPCs</option>
          </select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            The selected mode is included in the .env snippet below. Local mode is intended for a node installed on the same server as the API.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            For a separately hosted web UI, build with <code>VITE_API_BASE_URL</code> set to this API server and allow the UI origin with <code>CORS_ALLOWED_ORIGINS</code> on the API server.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              {connectionMode === "server" ? "Server-local RPC URL" : "Primary / remote RPC URL"}
            </label>
            <Input
              aria-label="Primary RPC URL"
              value={rpc1}
              onChange={(e) => setRpc1(e.target.value)}
              placeholder={connectionMode === "server" ? "http://127.0.0.1:8545" : "https://app.netlifegy.com/api/rpc"}
              className="font-mono text-xs"
            />
            {status1 && <div className="mt-1.5"><RpcStatusBadge s={status1} /></div>}
          </div>
          <div>
           <label className="text-xs text-muted-foreground mb-1.5 block">Remote fallback / boost RPC URL</label>
            <Input
              aria-label="Fallback RPC URL"
              value={rpc2}
              onChange={(e) => setRpc2(e.target.value)}
              placeholder="https://boost.netlifegy.com"
              className="font-mono text-xs"
            />
            {status2 && <div className="mt-1.5"><RpcStatusBadge s={status2} /></div>}
          </div>
        </div>
      </div>

      {/* Bootnode / Peer Config */}
      <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
           <Server className="w-4 h-4 text-primary" /> Bootnode / Full Node Enode
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          The enode URL of your full node or bootnode. Paste this into your geth node's
          <code className="mx-1 px-1 py-0.5 rounded bg-secondary font-mono text-[11px]">static-nodes.json</code>
          to make your LITE / VALIDATOR node connect to it automatically.
        </p>
        <Input
          value={boot}
          onChange={(e) => setBoot(e.target.value)}
          placeholder="enode://PUBKEY@IP:30303"
          className="font-mono text-xs"
        />
        {boot && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">static-nodes.json content</span>
              <button
                onClick={() => copy(STATIC_NODES, "static-nodes.json")}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <pre className="text-[11px] font-mono bg-secondary/60 border border-border rounded-lg px-3 py-2 overflow-x-auto text-muted-foreground">
              {STATIC_NODES}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              On your server: paste this into{" "}
              <code className="px-1 py-0.5 rounded bg-secondary font-mono text-[11px]">/var/lib/gyds/geth/static-nodes.json</code>,
              then run <code className="px-1 py-0.5 rounded bg-secondary font-mono text-[11px]">gyds-restart</code>.
            </p>
          </div>
        )}
      </div>

      {/* Save / Reset */}
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted-foreground text-xs">
          <RotateCcw className="w-3 h-3" /> Reset to defaults
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>

      {/* .env Snippet */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground">.env / deploy config snippet</h2>
          <button
           onClick={() => copy(NODE_ENV_SNIPPET, ".env snippet")}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Paste these into your server's <code className="font-mono">.env</code> file at{" "}
          <code className="font-mono text-[11px]">/var/www/gyds-explorer/.env</code>, then rebuild the frontend.
        </p>
        <pre className="text-[11px] font-mono bg-secondary/60 border border-border rounded-lg px-3 py-2.5 overflow-x-auto text-muted-foreground whitespace-pre">
          {NODE_ENV_SNIPPET}
        </pre>
        <div className="mt-3 p-3 rounded-lg bg-secondary/40 border border-border">
          <p className="text-xs text-muted-foreground font-semibold mb-1">After updating .env on the server:</p>
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre">{`cd /var/www/gyds-explorer
npm run build
sudo systemctl reload nginx`}</pre>
        </div>
      </div>

    </div>
  );
}

// ── Network Nodes Tab ─────────────────────────────────────────────────────────
type NodeConnectionMode = "server" | "remote";

function isServerLocalRpc(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function NodesTab() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "full" as NetworkNodeType,
    connectionMode: "" as NodeConnectionMode | "",
    rpcUrl: "",
    enode: "",
  });
  const nodesRequestInFlight = useRef(false);

  const loadNodes = useCallback(async (silent = false) => {
    if (nodesRequestInFlight.current) return;
    nodesRequestInFlight.current = true;
    if (!silent) setLoading(true);
    try {
      setNodes(await fetchAdminNetworkNodes());
    } catch (error) {
      if (!silent) {
        toast.error("Could not load network nodes", { description: error instanceof Error ? error.message : "API unavailable" });
      }
    } finally {
      nodesRequestInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNodes();
    const interval = window.setInterval(() => { void loadNodes(true); }, 5000);
    return () => window.clearInterval(interval);
  }, [loadNodes]);

  const saveNode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.connectionMode) {
      toast.error("Choose whether this node runs on the API server or a remote server");
      return;
    }
    if (!form.name.trim() || !form.rpcUrl.trim()) {
      toast.error("Name and RPC URL are required");
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: form.name.trim(),
        type: form.type,
        rpcUrl: form.rpcUrl.trim(),
        enode: form.enode.trim() || null,
        isActive: editingId ? nodes.find((node) => node.id === editingId)?.isActive ?? true : true,
      };
      if (editingId) await updateNetworkNode(editingId, input);
      else await createNetworkNode({ ...input, status: "disconnected" });
      setEditingId(null);
      setForm({ name: "", type: "full", connectionMode: "", rpcUrl: "", enode: "" });
      toast.success(editingId ? "Network node updated" : "Network node added", {
        description: form.enode.trim()
          ? "The supplied enode URL was saved."
          : form.type === "boot"
            ? "The boot node enode URL was discovered."
            : "The RPC endpoint was saved; enode access is not needed for RPC queries.",
      });
      loadNodes();
    } catch (error) {
      toast.error("Could not add node", { description: error instanceof Error ? error.message : "Request failed" });
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (node: NetworkNode) => {
    setEditingId(node.id);
    setForm({
      name: node.name,
      type: node.type,
      connectionMode: isServerLocalRpc(node.rpcUrl) ? "server" : "remote",
      rpcUrl: node.rpcUrl,
      enode: node.enode || "",
    });
  };

  const toggle = async (node: NetworkNode) => {
    try {
      await toggleNetworkNode(node.id, !node.isActive);
      toast(node.isActive ? "Node disconnected" : "Node connected");
      loadNodes();
    } catch (error) {
      toast.error("Could not change node connection", { description: error instanceof Error ? error.message : "Request failed" });
    }
  };

  const remove = async (node: NetworkNode) => {
    if (!confirm(`Remove ${node.name}?`)) return;
    try {
      await deleteNetworkNode(node.id);
      toast.success("Node removed");
      loadNodes();
    } catch (error) {
      toast.error("Could not remove node", { description: error instanceof Error ? error.message : "Request failed" });
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={saveNode} className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{editingId ? "Edit network node" : "Add network node"}</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Node name" />
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as NetworkNodeType })} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
            <option value="main">Main node</option>
            <option value="full">Full node</option>
            <option value="lite">Lite node</option>
            <option value="rpc">RPC node</option>
            <option value="boost">Boost node</option>
            <option value="validator">Validator node</option>
            <option value="boot">Boot node</option>
          </select>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Where is this node running?</label>
            <select
              required
              value={form.connectionMode}
              onChange={(event) => {
                const connectionMode = event.target.value as NodeConnectionMode;
                const currentUrlIsLocal = isServerLocalRpc(form.rpcUrl);
                const rpcUrl = connectionMode === "server"
                  ? currentUrlIsLocal ? form.rpcUrl : "http://127.0.0.1:8545"
                  : currentUrlIsLocal ? "" : form.rpcUrl;
                setForm({ ...form, connectionMode, rpcUrl });
              }}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="" disabled>Choose where the API server reaches this node</option>
              <option value="server">Same server as the API (localhost)</option>
              <option value="remote">Different server (remote RPC URL)</option>
            </select>
          </div>
          <div>
            <Input
              value={form.rpcUrl}
              onChange={(event) => setForm({ ...form, rpcUrl: event.target.value })}
              placeholder={!form.connectionMode ? "Choose node location first" : form.connectionMode === "server" ? "http://127.0.0.1:8545" : "https://rpc.example.com"}
              disabled={!form.connectionMode}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {form.connectionMode === "server"
                ? "Use localhost only when the node runs on the same machine as the API server."
                : form.connectionMode === "remote"
                  ? "Enter an HTTP(S) RPC URL reachable by the API server; the browser does not contact the node directly."
                  : "Choose where the API server should connect to this node."}
            </p>
          </div>
           <div>
             <Input value={form.enode} onChange={(event) => setForm({ ...form, enode: event.target.value })} placeholder={form.type === "boot" ? "Leave blank to auto-detect enode" : "Optional enode URL"} className="font-mono text-xs" />
             <p className="mt-1 text-[11px] text-muted-foreground">
               Enode is optional for RPC access. Boot nodes require one; other nodes can be added when <code className="rounded bg-secondary px-1">admin_nodeInfo</code> is disabled.
             </p>
           </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !form.connectionMode} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editingId ? "Save node" : "Add node"}</Button>
            {editingId && <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm({ name: "", type: "full", connectionMode: "", rpcUrl: "", enode: "" }); }}>Cancel</Button>}
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-5 py-3">
          <div><h2 className="text-sm font-semibold">Configured nodes</h2><p className="text-xs text-muted-foreground">The API checks active nodes every five seconds and retries disconnected nodes automatically.</p></div>
          <Button variant="ghost" size="sm" onClick={() => { void loadNodes(); }} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : nodes.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">No nodes configured yet.</p>
        ) : nodes.map((node) => (
            <div key={node.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 last:border-0">
              <span className={`h-2.5 w-2.5 rounded-full ${node.isActive && node.status === "connected" ? "bg-primary" : node.isActive ? "bg-destructive" : "bg-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{node.name}</p><span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground">{node.type}</span><span className={`rounded px-1.5 py-0.5 text-[11px] ${!node.isActive ? "bg-secondary text-muted-foreground" : node.status === "connected" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{!node.isActive ? "Disabled" : node.status === "connected" ? "Connected" : "Disconnected"}</span></div>
                <p className="break-all font-mono text-xs text-muted-foreground">{node.rpcUrl}</p>
                {node.enode && <p className="break-all font-mono text-[11px] text-muted-foreground">{node.enode}</p>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => beginEdit(node)} className="gap-1.5 text-xs"><Settings className="h-3.5 w-3.5" /> Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => toggle(node)} className="text-xs">{node.isActive ? "Disable" : "Enable"}</Button>
                <Button variant="ghost" size="sm" onClick={() => remove(node)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Coin Settings Tab ──────────────────────────────────────────────────────────
function CoinSettingsTab() {
  const [coins, setCoins] = useState<CoinSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const loadCoins = useCallback(async () => {
    setLoading(true);
    try {
      setCoins(await fetchCoinSettings());
    } catch (error) {
      toast.error("Could not load coin settings", { description: error instanceof Error ? error.message : "API unavailable" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCoins(); }, [loadCoins]);

  const updateField = (symbol: string, field: keyof CoinSetting, value: string | number | null) => {
    setCoins((current) => current.map((coin) => coin.symbol === symbol ? { ...coin, [field]: value } : coin));
  };

  const save = async (coin: CoinSetting) => {
    setSaving(coin.symbol);
    try {
      await updateCoinSetting(coin.symbol, {
        name: coin.name.trim(),
        decimals: Number(coin.decimals),
        contractAddress: coin.contractAddress?.trim() || null,
        logoUrl: coin.logoUrl?.trim() || null,
        description: coin.description.trim(),
      });
      toast.success(`${coin.symbol} settings saved`);
    } catch (error) {
      toast.error("Could not save coin settings", { description: error instanceof Error ? error.message : "Request failed" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Coin information</h2><p className="text-xs text-muted-foreground">These public values power the About Coins page and wallet labels.</p></div><Button variant="ghost" size="sm" onClick={loadCoins} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button></div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : coins.length === 0 ? <p className="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">No coin settings found.</p> : coins.map((coin) => (
        <div key={coin.symbol} className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3"><Coins className="h-5 w-5 text-primary" /><div><h3 className="font-semibold">{coin.symbol}</h3><p className="text-xs text-muted-foreground">Public coin metadata</p></div></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1.5 block text-xs text-muted-foreground">Name</label><Input value={coin.name} onChange={(event) => updateField(coin.symbol, "name", event.target.value)} /></div>
            <div><label className="mb-1.5 block text-xs text-muted-foreground">Symbol</label><Input value={coin.symbol} disabled className="font-mono" /></div>
            <div><label className="mb-1.5 block text-xs text-muted-foreground">Decimals</label><Input type="number" min={0} max={36} value={coin.decimals} onChange={(event) => updateField(coin.symbol, "decimals", Number(event.target.value))} /></div>
            <div><label className="mb-1.5 block text-xs text-muted-foreground">ERC-20 contract address</label><Input value={coin.contractAddress || ""} onChange={(event) => updateField(coin.symbol, "contractAddress", event.target.value)} placeholder="0x… (leave empty for native coin)" className="font-mono text-xs" /></div>
            <div><label className="mb-1.5 block text-xs text-muted-foreground">Logo URL</label><Input value={coin.logoUrl || ""} onChange={(event) => updateField(coin.symbol, "logoUrl", event.target.value)} placeholder="/assets/gyds-logo.svg" className="font-mono text-xs" /></div>
            <div className="md:col-span-2"><label className="mb-1.5 block text-xs text-muted-foreground">About text</label><Textarea value={coin.description} onChange={(event) => updateField(coin.symbol, "description", event.target.value)} rows={4} placeholder="Describe this coin for the public About Coins page." /></div>
          </div>
          <div className="mt-4 flex justify-end"><Button onClick={() => save(coin)} disabled={saving === coin.symbol} className="gap-2">{saving === coin.symbol ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save {coin.symbol}</Button></div>
        </div>
      ))}
    </div>
  );
}

// ── Admin Wallets Tab ─────────────────────────────────────────────────────────
function AdminWalletsTab() {
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel]     = useState("");
  const [adding, setAdding]         = useState(false);

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/wallets`, { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 401) { toast.error("Session expired — please login again."); return; }
        throw new Error("Failed to fetch wallets");
      }
      setWallets(await res.json());
    } catch (e: unknown) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to load wallets" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  const addWallet = async () => {
    if (!newAddress || !/^0x[a-fA-F0-9]{40}$/.test(newAddress)) {
      toast.error("Invalid address", { description: "Enter a valid 0x... address." });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/admin/wallets`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ walletAddress: newAddress, label: newLabel || null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to add wallet"); }
      toast.success("Wallet added", { description: `${newAddress.slice(0, 10)}...` });
      setNewAddress(""); setNewLabel("");
      fetchWallets();
    } catch (e: unknown) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to add" });
    } finally {
      setAdding(false);
    }
  };

  const removeWallet = async (id: number, address: string) => {
    if (!confirm(`Remove admin wallet ${address.slice(0, 10)}...?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/wallets/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to remove"); }
      toast.success("Wallet removed");
      fetchWallets();
    } catch (e: unknown) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to remove" });
    }
  };

  const toggleWallet = async (id: number, currentActive: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/admin/wallets/${id}/toggle`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      fetchWallets();
      toast(currentActive ? "Wallet deactivated" : "Wallet activated");
    } catch { toast.error("Failed to update wallet status"); }
  };

  return (
    <div className="space-y-5">
      {/* Add New Wallet */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Add Admin Wallet
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="0x... wallet address"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className="font-mono text-xs flex-1"
          />
          <Input
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="text-xs sm:w-40"
          />
          <Button onClick={addWallet} disabled={adding} className="gap-2">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Add
          </Button>
        </div>
      </div>

      {/* Wallets List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Authorized Admin Wallets
            <span className="text-muted-foreground font-normal">({wallets.length})</span>
          </h2>
          <Button variant="ghost" size="sm" onClick={fetchWallets} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground text-sm">
            No admin wallets configured. Add one above.
          </div>
        ) : (
          wallets.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
              {w.isActive
                ? <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                : <XCircle    className="w-4 h-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono break-all">{w.walletAddress}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {w.label && <span className="text-xs text-muted-foreground">{w.label}</span>}
                  <span className="text-xs text-muted-foreground">Added {new Date(w.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => toggleWallet(w.id, w.isActive)} className="text-xs">
                  {w.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeWallet(w.id, w.walletAddress)} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Tokens Tab ────────────────────────────────────────────────────────────────
const SOLIDITY_TEMPLATE = (name: string, symbol: string, decimals: number, supply: string, mintable: boolean) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ${name.replace(/\s+/g, "")}Token {
    string  public name     = "${name}";
    string  public symbol   = "${symbol}";
    uint8   public decimals = ${decimals};
    uint256 public totalSupply;
    address public owner;
    bool    public mintable = ${mintable};

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor() {
        owner = msg.sender;
        uint256 raw = ${supply} * (10 ** uint256(decimals));
        totalSupply           = raw;
        balanceOf[msg.sender] = raw;
        emit Transfer(address(0), msg.sender, raw);
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }${mintable ? `
    function mint(address to, uint256 amount) public onlyOwner {
        require(mintable, "Token is not mintable");
        uint256 raw = amount * (10 ** uint256(decimals));
        totalSupply   += raw;
        balanceOf[to] += raw;
        emit Mint(to, raw);
        emit Transfer(address(0), to, raw);
    }
    function mintRaw(address to, uint256 rawAmount) public onlyOwner {
        require(mintable, "Token is not mintable");
        require(to != address(0), "Mint to zero address");
        require(rawAmount > 0, "Amount must be greater than zero");
        totalSupply   += rawAmount;
        balanceOf[to] += rawAmount;
        emit Mint(to, rawAmount);
        emit Transfer(address(0), to, rawAmount);
    }
    function supportsRawMint() public pure returns (bool) {
        return true;
    }` : ""}
    function burn(uint256 amount) public {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply           -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}`;

interface DeployedToken {
  address: string;
  name: string;
  symbol: string;
  supply: string;
  decimals: number;
  deployedAt: string;
}

const GYD_ADMIN_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
  "function mintable() view returns (bool)",
  "function supportsRawMint() view returns (bool)",
  "function mintRaw(address to, uint256 rawAmount)",
  "function mint(address to, uint256 amount)",
];

interface GydContractInfo {
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  owner: string;
  mintable: boolean;
  supportsRawMint: boolean;
}

function GydMintPanel({ rpcUrl, refreshKey }: { rpcUrl: string; refreshKey: number }) {
  const [contractAddress, setContractAddress] = useState("");
  const [contractInfo, setContractInfo] = useState<GydContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [minting, setMinting] = useState(false);
  const [txHash, setTxHash] = useState("");
  const session = getStoredSession();
  const isAuthorizedSession = Boolean(session && isPrivilegedSession(session));
  const isOwnerSession = Boolean(
    isAuthorizedSession &&
    contractInfo &&
    session?.walletAddress.toLowerCase() === contractInfo.owner.toLowerCase(),
  );

  const loadContract = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const settings = await fetchCoinSettings();
      const setting = settings.find((coin) => coin.symbol.toUpperCase() === "GYD");
      const address = setting?.contractAddress?.trim() || "";
      setContractAddress(address);
      if (!address) {
        setContractInfo(null);
        return;
      }
      if (!isAddress(address)) throw new Error("The GYD contract address in Admin → Coins is invalid.");

      const contract = new Contract(address, GYD_ADMIN_ABI, new JsonRpcProvider(rpcUrl));
      const [symbol, decimals, totalSupply, owner, mintable] = await Promise.all([
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
        contract.owner(),
        contract.mintable(),
      ]);
      let supportsRawMint = false;
      try {
        supportsRawMint = Boolean(await contract.supportsRawMint());
      } catch {
        // Older deployments do not expose the raw-unit mint capability marker.
      }
      if (String(symbol).toUpperCase() !== "GYD" || Number(decimals) !== 6) {
        throw new Error("The configured GYD contract must report symbol GYD and use 6 decimals.");
      }
      setContractInfo({
        symbol: String(symbol),
        decimals: Number(decimals),
        totalSupply: BigInt(totalSupply),
        owner: String(owner),
        mintable: Boolean(mintable),
        supportsRawMint,
      });
    } catch (error) {
      setContractInfo(null);
      setLoadError(error instanceof Error ? error.message : "Could not read the GYD contract.");
    } finally {
      setLoading(false);
    }
  }, [rpcUrl]);

  useEffect(() => { void loadContract(); }, [loadContract, refreshKey]);

  const handleMint = async () => {
    const currentSession = getStoredSession();
    if (!currentSession || !isPrivilegedSession(currentSession)) {
      toast.error("Sign in with an authorized admin wallet before minting.");
      return;
    }
    if (!contractAddress || !contractInfo) {
      toast.error("Deploy and register the GYD contract before minting.");
      return;
    }
    if (currentSession.walletAddress.toLowerCase() !== contractInfo.owner.toLowerCase()) {
      toast.error("This admin wallet is not the on-chain GYD owner.");
      return;
    }
    if (!contractInfo.mintable) {
      toast.error("This GYD contract was deployed with minting disabled.");
      return;
    }
    if (!isAddress(recipient) || recipient.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      toast.error("Enter a valid, non-zero recipient wallet address.");
      return;
    }
    if (!amount.trim()) {
      toast.error("Enter the amount of GYD to mint.");
      return;
    }

    let rawAmount: bigint;
    try {
      rawAmount = parseUnits(amount.trim(), contractInfo.decimals);
    } catch {
      toast.error(`Enter a valid amount with no more than ${contractInfo.decimals} decimal places.`);
      return;
    }
    if (rawAmount <= 0n) {
      toast.error("Mint amount must be greater than zero.");
      return;
    }
    if (!contractInfo.supportsRawMint && !/^\d+$/.test(amount.trim())) {
      toast.error("This older GYD contract only supports minting whole tokens.");
      return;
    }

    const amountLabel = `${amount.trim()} GYD`;
    if (!window.confirm(`Mint ${amountLabel} to ${recipient}? This action changes the token supply. It does not verify reserves or maintain the GYD peg.`)) {
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      toast.error("MetaMask or another browser wallet is required to mint.");
      return;
    }

    setMinting(true);
    setTxHash("");
    try {
      let browserProvider = new BrowserProvider(ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      let signer = await browserProvider.getSigner();
      let signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== currentSession.walletAddress.toLowerCase()) {
        throw new Error("Connect the same wallet used for this admin session.");
      }

      const network = await browserProvider.getNetwork();
      if (network.chainId !== GYDS_CHAIN_ID) {
        try {
          await browserProvider.send("wallet_switchEthereumChain", [{ chainId: GYDS_CHAIN_HEX }]);
        } catch (switchError: any) {
          if (switchError?.code === 4902) {
            await browserProvider.send("wallet_addEthereumChain", [{
              chainId: GYDS_CHAIN_HEX,
              chainName: "GYDS Network",
              rpcUrls: [rpcUrl],
              nativeCurrency: { name: "GYDS", symbol: "GYDS", decimals: 18 },
            }]);
            await browserProvider.send("wallet_switchEthereumChain", [{ chainId: GYDS_CHAIN_HEX }]);
          } else {
            throw switchError;
          }
        }
        browserProvider = new BrowserProvider(ethereum);
        signer = await browserProvider.getSigner();
        signerAddress = await signer.getAddress();
      }
      if (signerAddress.toLowerCase() !== currentSession.walletAddress.toLowerCase()) {
        throw new Error("The connected wallet changed. Reconnect the authenticated admin wallet.");
      }
      if ((await browserProvider.getNetwork()).chainId !== GYDS_CHAIN_ID) {
        throw new Error("Switch your wallet to GYDS Network (chain ID 198282).");
      }

      const contract = new Contract(contractAddress, GYD_ADMIN_ABI, signer);
      const [owner, mintable, symbol, decimals] = await Promise.all([
        contract.owner(),
        contract.mintable(),
        contract.symbol(),
        contract.decimals(),
      ]);
      if (String(owner).toLowerCase() !== currentSession.walletAddress.toLowerCase()) {
        throw new Error("The on-chain GYD owner does not match this admin wallet.");
      }
      if (!Boolean(mintable) || String(symbol).toUpperCase() !== "GYD" || Number(decimals) !== 6) {
        throw new Error("The registered contract is no longer a mintable six-decimal GYD token.");
      }

      const tx = contractInfo.supportsRawMint
        ? await contract.mintRaw(recipient, rawAmount)
        : await contract.mint(recipient, BigInt(amount.trim()));
      setTxHash(tx.hash);
      await tx.wait();
      toast.success("GYD mint confirmed", { description: `${amountLabel} sent to ${recipient}` });
      setAmount("");
      await loadContract();
    } catch (error: any) {
      toast.error("GYD mint failed", {
        description: error?.shortMessage || error?.reason || error?.message || "Transaction was not completed.",
      });
    } finally {
      setMinting(false);
    }
  };

  return (
    <section className="rounded-xl border border-amber-500/30 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-amber-500/20 bg-amber-500/5">
        <Shield className="w-4 h-4 text-amber-500" />
        <h2 className="font-semibold text-sm">Admin-approved GYD minting</h2>
        <span className="ml-auto text-xs text-muted-foreground">Owner wallet required</span>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          GYD uses 6 decimals. Minting creates new tokens and does not verify collateral, reserves, swaps, or the stablecoin peg.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading GYD contract…</p>
        ) : loadError ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</div>
        ) : !contractAddress ? (
          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
            No GYD contract is registered yet. Use the GYD preset above to deploy a mintable six-decimal contract, then it will appear here.
          </div>
        ) : contractInfo ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2 rounded-lg border border-border bg-secondary/20 p-3 text-xs">
              <p><span className="text-muted-foreground">Contract:</span> <code className="break-all">{contractAddress}</code></p>
              <p><span className="text-muted-foreground">Owner:</span> <code className="break-all">{contractInfo.owner}</code></p>
              <p><span className="text-muted-foreground">Total supply:</span> {formatUnits(contractInfo.totalSupply, contractInfo.decimals)} GYD</p>
              <p><span className="text-muted-foreground">Minting:</span> {contractInfo.mintable ? "Enabled" : "Disabled"}</p>
            </div>
            {!isAuthorizedSession ? (
              <p className="text-sm text-destructive">An authorized admin session is required.</p>
            ) : !isOwnerSession ? (
              <p className="text-sm text-amber-600">The signed-in admin wallet is not the on-chain owner of this GYD contract.</p>
            ) : !contractInfo.mintable ? (
              <p className="text-sm text-destructive">Minting is disabled in this contract and cannot be enabled from this screen.</p>
            ) : (
              <div className="space-y-3">
                {!contractInfo.supportsRawMint && (
                  <p className="text-xs text-amber-600">Legacy contract detected: only whole-token mint amounts are supported.</p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Recipient wallet</label>
                    <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Amount in GYD</label>
                    <Input type="number" min="0" step={contractInfo.supportsRawMint ? "0.000001" : "1"} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={contractInfo.supportsRawMint ? "e.g. 125.50" : "Whole tokens only"} />
                  </div>
                </div>
                <Button onClick={handleMint} disabled={minting || !isOwnerSession} className="gap-2">
                  {minting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                  {minting ? "Minting…" : "Mint GYD"}
                </Button>
                <Button variant="outline" size="sm" disabled={loading || minting} onClick={() => void loadContract()} className="ml-2 gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh supply
                </Button>
                {txHash && <p className="text-xs text-muted-foreground break-all">Transaction: {txHash}</p>}
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

function TokensTab() {
  const { network, networkType } = useNetwork();
  const rpcUrl = networkType === "custom"
    ? network.rpcEndpoints[0] || ""
    : proxyRpcUrl(undefined, networkType);

  // Form state
  const [tokenName,     setTokenName]     = useState("My GYDS Token");
  const [tokenSymbol,   setTokenSymbol]   = useState("MGT");
  const [tokenDecimals, setTokenDecimals] = useState("6");
  const [tokenSupply,   setTokenSupply]   = useState("1000000");
  const [mintable,      setMintable]      = useState(false);
  const [showCode,      setShowCode]      = useState(false);
  const [showManual,    setShowManual]    = useState(false);
  const [gydRefreshKey, setGydRefreshKey] = useState(0);

  const applyGydPreset = () => {
    setTokenName("GYD Stablecoin");
    setTokenSymbol("GYD");
    setTokenDecimals("6");
    setTokenSupply("0");
    setMintable(true);
    toast.success("GYD stablecoin preset applied");
  };

  // Deploy hook
  const { deploy, reset: resetDeploy, status: deployStatus, txHash, contractAddress, error: deployError } = useTokenDeploy(
    rpcUrl,
    network.chainId,
    network.name,
  );

  // Deployed tokens registry (localStorage)
  const [deployedTokens, setDeployedTokens] = useState<DeployedToken[]>(() => {
    try { return JSON.parse(localStorage.getItem("gyds_deployed_tokens") || "[]"); }
    catch { return []; }
  });
  const [newTokenAddr,  setNewTokenAddr]  = useState("");
  const [newTokenLabel, setNewTokenLabel] = useState("");

  const solidityCode = SOLIDITY_TEMPLATE(
    tokenName || "MyToken",
    tokenSymbol || "MTK",
    parseInt(tokenDecimals) || 6,
    tokenSupply || "1000000",
    mintable,
  );

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied!`));
  };

  const saveTokenToRegistry = (result: DeployResult) => {
    const entry: DeployedToken = {
      address:    result.contractAddress,
      name:       result.name,
      symbol:     result.symbol,
      supply:     result.supply,
      decimals:   result.decimals,
      deployedAt: result.deployedAt,
    };
    const updated = [entry, ...deployedTokens.filter((t) => t.address !== result.contractAddress)];
    setDeployedTokens(updated);
    localStorage.setItem("gyds_deployed_tokens", JSON.stringify(updated));
  };

  const publishTokenSettings = async (result: DeployResult) => {
    try {
      await updateCoinSetting(result.symbol, {
        name: result.name,
        decimals: result.decimals,
        contractAddress: result.contractAddress,
        logoUrl: null,
        description: `ERC-20 token deployed on GYDSChain. Contract: ${result.contractAddress}`,
      });
      toast.success(`${result.symbol} was added to the shared token catalog`);
    } catch (error) {
      toast.error("Token deployed, but shared catalog update failed", {
        description: error instanceof Error ? error.message : "Save the contract in Admin → Coins.",
      });
    }
  };

  const handleDeploy = async () => {
    if (!tokenName.trim() || !tokenSymbol.trim()) {
      toast.error("Token name and symbol are required.");
      return;
    }
    const isGyd = tokenSymbol.trim().toUpperCase() === "GYD";
    if (!/^\d+$/.test(tokenSupply) || Number(tokenSupply) < 0 || (!isGyd && Number(tokenSupply) === 0)) {
      toast.error(isGyd ? "Initial supply must be a whole number of zero or more." : "Initial supply must be a positive whole number.");
      return;
    }
    const decimals = Number(tokenDecimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      toast.error("Decimals must be a whole number from 0 to 18.");
      return;
    }
    if (isGyd && (decimals !== 6 || !mintable)) {
      toast.error("GYD must use 6 decimals with owner-controlled minting enabled.");
      return;
    }
    const session = getStoredSession();
    if (!session || !isPrivilegedSession(session)) {
      toast.error("Sign in with an authorized admin wallet before deploying tokens.");
      return;
    }
    if (isGyd && networkType !== "mainnet") {
      toast.error("Deploy the GYD stablecoin on GYDS Mainnet, not Testnet or a custom network.");
      return;
    }
    const result = await deploy({
      name:          tokenName.trim(),
      symbol:        tokenSymbol.trim(),
      decimals,
      initialSupply: tokenSupply,
      mintable,
      expectedDeployer: session.walletAddress,
    });
    if (result) {
      saveTokenToRegistry(result);
      await publishTokenSettings(result);
      if (result.symbol.toUpperCase() === "GYD") setGydRefreshKey((key) => key + 1);
      toast.success(`${result.name} (${result.symbol}) deployed at ${result.contractAddress.slice(0, 10)}…`);
    }
  };

  const addToken = () => {
    if (!newTokenAddr.startsWith("0x") || newTokenAddr.length !== 42) {
      toast.error("Enter a valid 0x contract address (42 chars).");
      return;
    }
    const entry: DeployedToken = {
      address:    newTokenAddr.trim(),
      name:       newTokenLabel || "Unknown Token",
      symbol:     "",
      supply:     "",
      decimals:   6,
      deployedAt: new Date().toISOString(),
    };
    const updated = [entry, ...deployedTokens];
    setDeployedTokens(updated);
    localStorage.setItem("gyds_deployed_tokens", JSON.stringify(updated));
    setNewTokenAddr("");
    setNewTokenLabel("");
    toast.success("Token address saved.");
  };

  const removeToken = (addr: string) => {
    const updated = deployedTokens.filter((t) => t.address !== addr);
    setDeployedTokens(updated);
    localStorage.setItem("gyds_deployed_tokens", JSON.stringify(updated));
  };

  const isDeploying = ["connecting","switching","deploying","confirming"].includes(deployStatus);

  const deployStepLabels: Record<string, string> = {
    connecting:  "Connecting to MetaMask…",
    switching:   "Switching to GYDS Network…",
    deploying:   "Sending transaction…",
    confirming:  "Waiting for confirmation…",
    success:     "Deployed!",
    error:       "Deployment failed",
  };

  const walletNetworkName = networkType === "custom" ? "GYDS Custom Network" : `GYDS ${network.name}`;
  const metaMaskSetup = `Network name:  ${walletNetworkName}
RPC URL:       ${rpcUrl}
Chain ID:      ${network.chainId ?? "Check the custom RPC"}
Currency:      GYDS`;

  return (
    <div className="space-y-6">
      {/* Token Builder */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-secondary/30">
          <Coins className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">ERC-20 Token Builder</h2>
        </div>
        <div className="p-5 space-y-5">
          <p className="text-sm text-muted-foreground">
            Configure your token parameters, then deploy to the GYDS network using Remix IDE or the geth console.
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex-1">
              <p className="text-sm font-medium">GYD stablecoin</p>
              <p className="text-xs text-muted-foreground">Preset: 6 decimals, zero initial supply, and admin-controlled minting.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={applyGydPreset}>Use GYD preset</Button>
          </div>

          {/* Token params grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token Name</label>
              <Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="My GYDS Token" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Symbol</label>
              <Input value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())} placeholder="MGT" maxLength={10} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Decimals</label>
              <Input type="number" min={0} max={18} value={tokenDecimals} onChange={(e) => setTokenDecimals(e.target.value)} placeholder="6" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Initial Supply (whole tokens)</label>
              <Input type="number" min={tokenSymbol.trim().toUpperCase() === "GYD" ? 0 : 1} step={1} value={tokenSupply} onChange={(e) => setTokenSupply(e.target.value)} placeholder="1000000" />
            </div>
          </div>

          {/* Mintable toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
            <button
              onClick={() => setMintable((m) => !m)}
              className={`relative w-10 h-5 rounded-full transition-colors ${mintable ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${mintable ? "translate-x-5" : "translate-x-0"}`} />
            </button>
            <div>
              <p className="text-sm font-medium">Mintable</p>
              <p className="text-xs text-muted-foreground">Owner can create additional tokens after deployment</p>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-secondary/30 border border-border p-4 space-y-1">
            <p className="text-xs font-mono text-muted-foreground">Token summary</p>
            <p className="text-sm font-mono">
              <span className="text-primary">{tokenName || "—"}</span>
              {" "}({tokenSymbol || "—"}) · {tokenDecimals} decimals ·{" "}
              {Number(tokenSupply || 0).toLocaleString()} initial supply
              {mintable ? " · mintable" : " · fixed supply"}
            </p>
            <p className="text-xs text-muted-foreground">
              Raw total supply: {tokenSupply && tokenDecimals
                ? (BigInt(tokenSupply || 0) * 10n ** BigInt(tokenDecimals || 6)).toString()
                : "—"} units
            </p>
          </div>

          {/* Solidity code */}
          <div>
            <button
              onClick={() => setShowCode((s) => !s)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline mb-2"
            >
              {showCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showCode ? "Hide" : "Show"} Solidity contract code
            </button>
            {showCode && (
              <div className="relative">
                <pre className="text-xs font-mono bg-secondary/50 border border-border rounded-lg p-4 overflow-auto max-h-80 leading-relaxed">
                  {solidityCode}
                </pre>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => copyText(solidityCode, "Solidity contract")}
                  className="absolute top-2 right-2 h-7 text-xs gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <GydMintPanel rpcUrl={proxyRpcUrl(undefined, "mainnet")} refreshKey={gydRefreshKey} />

      {/* Deploy on GYDS Chain */}
      <div className="rounded-xl border border-primary/40 bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-primary/20 bg-primary/5">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Deploy on GYDS Chain</h2>
          <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">Requires an EVM wallet</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Deploy the token above to the selected GYDS network. Your browser wallet will add that network if needed.
          </p>

          {/* Status display */}
          {deployStatus === "idle" && (
            <Button
              onClick={handleDeploy}
              className="w-full gap-2 h-11 text-sm font-semibold"
            >
              <Zap className="w-4 h-4" />
              Deploy {tokenName || "Token"} ({tokenSymbol || "???"}) with wallet
            </Button>
          )}

          {isDeploying && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">{deployStepLabels[deployStatus]}</p>
              {txHash && (
                <p className="text-xs font-mono text-muted-foreground break-all text-center">
                  Tx: {txHash}
                </p>
              )}
            </div>
          )}

          {deployStatus === "success" && contractAddress && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                <p className="text-sm font-semibold text-primary">Token deployed successfully!</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Contract address</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-secondary px-2 py-1 rounded flex-1 break-all">{contractAddress}</code>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => copyText(contractAddress, "Contract address")}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Link to={`/address/${contractAddress}`}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
              {txHash && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Transaction hash</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-secondary px-2 py-1 rounded flex-1 break-all">{txHash}</code>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => copyText(txHash, "Tx hash")}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Link to={`/tx/${txHash}`}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">✓ Saved to Deployed Tokens Registry below</p>
              <Button variant="outline" size="sm" onClick={resetDeploy} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Deploy another token
              </Button>
            </div>
          )}

          {deployStatus === "error" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Deployment failed</p>
                  <p className="text-xs text-muted-foreground mt-1">{deployError}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={resetDeploy} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Try again
              </Button>
            </div>
          )}

          {/* MetaMask network config (always visible) */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Add the selected GYDS network to your wallet manually if needed:</p>
            <div className="relative">
              <pre className="text-xs font-mono bg-secondary/50 rounded p-2 overflow-auto">{metaMaskSetup}</pre>
              <Button variant="ghost" size="sm" onClick={() => copyText(metaMaskSetup, "MetaMask config")}
                className="absolute top-1 right-1 h-6 text-xs gap-1">
                <Copy className="w-3 h-3" /> Copy
              </Button>
            </div>
          </div>

          {/* Manual deployment fallback */}
          <div>
            <button
              onClick={() => setShowManual((s) => !s)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showManual ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showManual ? "Hide" : "Show"} manual deployment options (Remix / geth console / deploy-token.js)
            </button>
            {showManual && (
              <div className="mt-3 space-y-4 pl-3 border-l border-border">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Remix IDE</p>
                  <p className="text-xs text-muted-foreground">
                    Open{" "}
                    <a href="https://remix.ethereum.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                      remix.ethereum.org <ExternalLink className="w-3 h-3" />
                    </a>
                    , paste the Solidity code above, compile with 0.8.20+, connect your browser wallet → Injected Provider, deploy.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Server-side (deploy-token.js)</p>
                  <div className="relative">
                    <pre className="text-xs font-mono bg-secondary/50 border border-border rounded p-3 overflow-auto">{`cd /var/www/gyds-explorer
node deploy-token.js \\
  --name "${tokenName || "My GYDS Token"}" \\
  --symbol "${tokenSymbol || "MGT"}" \\
  --supply ${tokenSupply || "1000000"} \\
  --decimals ${tokenDecimals || "6"} \\
  --private-key 0xYOUR_PRIVATE_KEY`}</pre>
                    <Button variant="ghost" size="sm"
                      onClick={() => copyText(`node deploy-token.js --name "${tokenName}" --symbol "${tokenSymbol}" --supply ${tokenSupply} --decimals ${tokenDecimals} --private-key 0xYOUR_KEY`, "deploy command")}
                      className="absolute top-1.5 right-1.5 h-6 text-xs gap-1">
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deployed Tokens Registry */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-secondary/30">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Deployed Tokens Registry</h2>
          <span className="ml-auto text-xs text-muted-foreground">Saved locally in your browser</span>
        </div>
        <div className="p-5 space-y-4">
          {/* Add token */}
          <div className="flex gap-2">
            <Input
              value={newTokenLabel}
              onChange={(e) => setNewTokenLabel(e.target.value)}
              placeholder="Token name / label"
              className="w-40 shrink-0"
            />
            <Input
              value={newTokenAddr}
              onChange={(e) => setNewTokenAddr(e.target.value)}
              placeholder="0x contract address"
              className="font-mono text-xs flex-1"
            />
            <Button onClick={addToken} size="sm" className="gap-1 shrink-0">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          {/* Token list */}
          {deployedTokens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tokens registered yet. Deploy a token and paste its contract address here.
            </p>
          ) : (
            <div className="space-y-2">
              {deployedTokens.map((t) => (
                <div key={t.address} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                  <Coins className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs font-mono text-muted-foreground break-all">{t.address}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Added {new Date(t.deployedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => copyText(t.address, "Address")}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Link to={`/address/${t.address}`}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeToken(t.address)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AutoUpdateSettingsTab() {
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await fetchAutoUpdateSettings());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load update settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      const next = await saveAutoUpdateSettings(enabled);
      setSettings(next);
      toast.success(enabled ? "Automatic updates enabled" : "Automatic updates disabled");
    } catch (saveError) {
      toast.error("Could not save automatic update setting", {
        description: saveError instanceof Error ? saveError.message : "Request failed",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Automatic Git updates</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Pull the latest code, install dependencies, rebuild the explorer and API, then restart services on a monthly schedule.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${settings?.enabled ? "text-primary" : "text-muted-foreground"}`}>
            {loading ? "Loading" : settings?.enabled ? "On" : "Off"}
          </span>
          <Switch
            checked={settings?.enabled ?? false}
            onCheckedChange={toggle}
            disabled={loading || saving || !settings?.schedulerInstalled}
            aria-label="Enable monthly automatic Git updates"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
          <Clock3 className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Scheduled time</p>
            <p className="text-sm font-medium">15th of each month at 3:00 AM</p>
            <p className="text-xs text-muted-foreground">America/Guyana time</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">Scheduler status</p>
          <p className="mt-1 text-sm font-medium">
            {loading ? "Checking…" : settings?.schedulerInstalled ? "Installed on this server" : "Not installed"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {settings?.schedulerInstalled
              ? settings.updatedAt
                ? `Last setting change: ${new Date(settings.updatedAt).toLocaleString()}`
                : "Updates are off until you enable them."
              : "Run sudo ./update.sh on the Ubuntu server to install the timer."}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {!settings?.schedulerInstalled && !loading && (
        <p className="mt-4 text-xs text-muted-foreground">
          The schedule runs server-side; the switch stays unavailable until the Ubuntu timer has been installed.
        </p>
      )}
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("node");
  const navigate = useNavigate();

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      setIsAuthenticated(false);
      return;
    }
    if (!isPrivilegedSession(session)) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setIsAuthenticated(true);
  }, [navigate]);

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Shield className="w-12 h-12 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground text-sm text-center max-w-md">
                Connect your authorized GYDS wallet to manage nodes, coin information, and admin wallets.
            </p>
            <WalletLoginDialog
              onLoginSuccess={() => setIsAuthenticated(true)}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "node",    label: "Node Settings",  icon: <Settings className="w-3.5 h-3.5" /> },
    { id: "nodes",   label: "Network Nodes",  icon: <Network  className="w-3.5 h-3.5" /> },
    { id: "coins",   label: "Coins",          icon: <Coins    className="w-3.5 h-3.5" /> },
    { id: "tokens",  label: "Tokens",         icon: <Coins    className="w-3.5 h-3.5" /> },
    { id: "updates", label: "Auto Updates",   icon: <CalendarClock className="w-3.5 h-3.5" /> },
    { id: "wallets", label: "Admin Wallets",  icon: <Shield   className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Configure node connections and manage admin access</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit mb-6 border border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "node"    && <NodeSettingsTab />}
        {activeTab === "nodes"   && <NodesTab />}
        {activeTab === "coins"   && <CoinSettingsTab />}
        {activeTab === "tokens"  && <TokensTab />}
        {activeTab === "updates" && <AutoUpdateSettingsTab />}
        {activeTab === "wallets" && <AdminWalletsTab />}
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
