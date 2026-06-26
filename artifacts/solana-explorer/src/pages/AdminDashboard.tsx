import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Shield, UserPlus, Trash2, Wallet, Loader2,
  CheckCircle, XCircle, RefreshCw, Settings, Network,
  Server, Wifi, WifiOff, Copy, RotateCcw, Save, Activity,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getStoredToken } from "@/lib/featureGateApi";
import WalletLoginDialog from "@/components/WalletLoginDialog";
import { useNetwork } from "@/contexts/NetworkContext";

const API_BASE = import.meta.env.VITE_FEATURE_GATE_URL || "http://localhost:3002";

type Tab = "wallets" | "node";

interface AdminWallet {
  id: number;
  wallet_address: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
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
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    if (json.error) return { ok: false, error: json.error.message };
    return { ok: true, blockNumber: parseInt(json.result, 16), latencyMs: Date.now() - start };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Unreachable" };
  }
}

// ── Node Settings Tab ─────────────────────────────────────────────────────────
function NodeSettingsTab() {
  const { primaryRpc, secondaryRpc, bootnodeEnode, setPrimaryRpc, setSecondaryRpc, setBootnodeEnode, resetToDefaults } = useNetwork();

  const [rpc1,  setRpc1]  = useState(primaryRpc);
  const [rpc2,  setRpc2]  = useState(secondaryRpc);
  const [boot,  setBoot]  = useState(bootnodeEnode);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [status1, setStatus1] = useState<RpcStatus | null>(null);
  const [status2, setStatus2] = useState<RpcStatus | null>(null);
  const [pinging, setPinging] = useState(false);

  const ENV_SNIPPET = `# ── GYDS Node / RPC Configuration ──────────────────
VITE_RPC_URL=${rpc1}
VITE_RPC_URL_2=${rpc2}${boot ? `

# ── Bootnode (add to static-nodes.json on your geth node)
BOOTNODE_ENODE=${boot}` : ""}`;

  const STATIC_NODES = boot
    ? `[\n  "${boot}"\n]`
    : "[]";

  useEffect(() => {
    setDirty(rpc1 !== primaryRpc || rpc2 !== secondaryRpc || boot !== bootnodeEnode);
  }, [rpc1, rpc2, boot, primaryRpc, secondaryRpc, bootnodeEnode]);

  const save = async () => {
    setSaving(true);
    setPrimaryRpc(rpc1.trim());
    setSecondaryRpc(rpc2.trim());
    setBootnodeEnode(boot.trim());
    await new Promise((r) => setTimeout(r, 300));
    setSaving(false);
    setDirty(false);
    toast.success("Node settings saved", { description: "Settings persisted in browser storage." });
  };

  const reset = () => {
    resetToDefaults();
    const envRpc1 = import.meta.env.VITE_RPC_URL || "https://rpc.netlifegy.com";
    const envRpc2 = import.meta.env.VITE_RPC_URL_2 || "https://rpc2.netlifegy.com";
    setRpc1(envRpc1);
    setRpc2(envRpc2);
    setBoot("");
    toast("Reset to defaults");
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

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Primary RPC URL</label>
            <Input
              value={rpc1}
              onChange={(e) => setRpc1(e.target.value)}
              placeholder="https://rpc.netlifegy.com"
              className="font-mono text-xs"
            />
            {status1 && <div className="mt-1.5"><RpcStatusBadge s={status1} /></div>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Secondary RPC URL (fallback)</label>
            <Input
              value={rpc2}
              onChange={(e) => setRpc2(e.target.value)}
              placeholder="https://rpc2.netlifegy.com"
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
            onClick={() => copy(ENV_SNIPPET, ".env snippet")}
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
          {ENV_SNIPPET}
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
      const res = await fetch(`${API_BASE}/api/admin/wallets`, { headers: authHeaders() });
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
      const res = await fetch(`${API_BASE}/api/admin/wallets`, {
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
      const res = await fetch(`${API_BASE}/api/admin/wallets/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to remove"); }
      toast.success("Wallet removed");
      fetchWallets();
    } catch (e: unknown) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to remove" });
    }
  };

  const toggleWallet = async (id: number, currentActive: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/wallets/${id}/toggle`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ is_active: !currentActive }),
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
              {w.is_active
                ? <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                : <XCircle    className="w-4 h-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono break-all">{w.wallet_address}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {w.label && <span className="text-xs text-muted-foreground">{w.label}</span>}
                  <span className="text-xs text-muted-foreground">Added {new Date(w.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => toggleWallet(w.id, w.is_active)} className="text-xs">
                  {w.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeWallet(w.id, w.wallet_address)} className="text-destructive hover:text-destructive">
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

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("node");

  useEffect(() => {
    const token = getStoredToken();
    if (token) setIsAuthenticated(true);
  }, []);

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
              Connect your authorized GYDS wallet to manage node settings and admin wallets.
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
        {activeTab === "wallets" && <AdminWalletsTab />}
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
