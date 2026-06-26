import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Shield, UserPlus, Trash2, Wallet, Loader2,
  CheckCircle, XCircle, RefreshCw, Settings, Network,
  Server, Wifi, WifiOff, Copy, RotateCcw, Save, Activity,
  Coins, Plus, ExternalLink, ChevronDown, ChevronUp, Zap, AlertCircle,
} from "lucide-react";
import { useTokenDeploy, type DeployResult } from "@/lib/useTokenDeploy";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getStoredToken } from "@/lib/featureGateApi";
import WalletLoginDialog from "@/components/WalletLoginDialog";
import { useNetwork } from "@/contexts/NetworkContext";

const API_BASE = import.meta.env.VITE_FEATURE_GATE_URL ?? "";

type Tab = "wallets" | "node" | "tokens";

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
        uint256 raw = amount * (10 ** uint256(decimals));
        totalSupply   += raw;
        balanceOf[to] += raw;
        emit Transfer(address(0), to, raw);
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

function TokensTab() {
  const { primaryRpc } = useNetwork();
  const rpcUrl = primaryRpc || import.meta.env.VITE_RPC_URL || "https://rpc.netlifegy.com";

  // Form state
  const [tokenName,     setTokenName]     = useState("My GYDS Token");
  const [tokenSymbol,   setTokenSymbol]   = useState("MGT");
  const [tokenDecimals, setTokenDecimals] = useState("18");
  const [tokenSupply,   setTokenSupply]   = useState("1000000");
  const [mintable,      setMintable]      = useState(false);
  const [showCode,      setShowCode]      = useState(false);
  const [showManual,    setShowManual]    = useState(false);

  // Deploy hook
  const { deploy, reset: resetDeploy, status: deployStatus, txHash, contractAddress, error: deployError } = useTokenDeploy(rpcUrl);

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
    parseInt(tokenDecimals) || 18,
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

  const handleDeploy = async () => {
    if (!tokenName.trim() || !tokenSymbol.trim()) {
      toast.error("Token name and symbol are required.");
      return;
    }
    if (!tokenSupply || Number(tokenSupply) <= 0) {
      toast.error("Initial supply must be greater than 0.");
      return;
    }
    const result = await deploy({
      name:          tokenName.trim(),
      symbol:        tokenSymbol.trim(),
      decimals:      parseInt(tokenDecimals) || 18,
      initialSupply: tokenSupply,
      mintable,
    });
    if (result) {
      saveTokenToRegistry(result);
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
      decimals:   18,
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

  const metaMaskSetup = `Network name:  GYDS Network
RPC URL:       ${rpcUrl}
Chain ID:      29987
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
              <Input type="number" min={0} max={18} value={tokenDecimals} onChange={(e) => setTokenDecimals(e.target.value)} placeholder="18" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Initial Supply (whole tokens)</label>
              <Input type="number" min={1} value={tokenSupply} onChange={(e) => setTokenSupply(e.target.value)} placeholder="1000000" />
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
                ? (BigInt(tokenSupply || 0) * 10n ** BigInt(tokenDecimals || 18)).toString()
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

      {/* Deploy on GYDS Chain */}
      <div className="rounded-xl border border-primary/40 bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-primary/20 bg-primary/5">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Deploy on GYDS Chain</h2>
          <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">Requires MetaMask</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Deploy the token above directly to the GYDS network. MetaMask will add the GYDS network automatically if needed.
          </p>

          {/* Status display */}
          {deployStatus === "idle" && (
            <Button
              onClick={handleDeploy}
              className="w-full gap-2 h-11 text-sm font-semibold"
            >
              <Zap className="w-4 h-4" />
              Deploy {tokenName || "Token"} ({tokenSymbol || "???"}) with MetaMask
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
            <p className="text-xs text-muted-foreground font-medium">Add GYDS network to MetaMask manually if needed:</p>
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
                    , paste the Solidity code above, compile with 0.8.20+, connect MetaMask → Injected Provider, deploy.
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
  --decimals ${tokenDecimals || "18"} \\
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
    { id: "tokens",  label: "Tokens",         icon: <Coins    className="w-3.5 h-3.5" /> },
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
        {activeTab === "tokens"  && <TokensTab />}
        {activeTab === "wallets" && <AdminWalletsTab />}
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
