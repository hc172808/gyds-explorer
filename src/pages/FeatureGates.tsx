import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ToggleLeft, ArrowLeft, CheckCircle, XCircle, Shield, LogOut, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import WalletLoginDialog from "@/components/WalletLoginDialog";
import {
  fetchFeatureGates,
  toggleFeatureGate,
  getAdminInfo,
  clearStoredToken,
  getStoredToken,
  type FeatureGate,
} from "@/lib/featureGateApi";

const DEFAULT_FEATURES: FeatureGate[] = [
  { id: "eip-1559", name: "EIP-1559 Base Fee", status: true, description: "Dynamic base fee per gas mechanism" },
  { id: "eip-2930", name: "EIP-2930 Access Lists", status: true, description: "Optional access lists for transactions" },
  { id: "eip-3855", name: "EIP-3855 PUSH0", status: true, description: "PUSH0 opcode support" },
  { id: "simd-296", name: "SiMD-296 Protocol", status: true, description: "GYDS network consensus enhancement" },
  { id: "shanghai", name: "Shanghai Upgrade", status: true, description: "Beacon chain withdrawal support" },
  { id: "eip-4337", name: "Account Abstraction (EIP-4337)", status: true, description: "Smart contract wallets as first-class accounts" },
  { id: "verkle", name: "Verkle Trees", status: true, description: "Verkle tree state commitment scheme" },
  { id: "eof", name: "EOF (EVM Object Format)", status: true, description: "Structured bytecode container format" },
  { id: "eip-4844", name: "EIP-4844 Proto-Danksharding", status: true, description: "Blob-carrying transactions for L2 scaling" },
  { id: "eip-6780", name: "EIP-6780 SELFDESTRUCT Removal", status: true, description: "Restricts SELFDESTRUCT to same-transaction context" },
];

const FeatureGates = () => {
  const [adminWallet, setAdminWallet] = useState<string | null>(null);
  const [adminLabel, setAdminLabel] = useState<string>("");
  const [features, setFeatures] = useState<FeatureGate[]>(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);

  // Check for existing session and load features
  useEffect(() => {
    const init = async () => {
      // Check existing admin token
      if (getStoredToken()) {
        const info = await getAdminInfo();
        if (info) {
          setAdminWallet(info.walletAddress);
          setAdminLabel(info.label);
        }
      }
      // Try to load from API
      await loadFeatures();
    };
    init();
  }, []);

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const gates = await fetchFeatureGates();
      if (gates && gates.length > 0) {
        setFeatures(gates);
        setApiAvailable(true);
      }
    } catch {
      // API not available, use defaults
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = async (id: string) => {
    const feature = features.find((f) => f.id === id);
    if (!feature) return;

    const newStatus = !feature.status;

    // Optimistic update
    setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, status: newStatus } : f)));

    if (apiAvailable) {
      try {
        await toggleFeatureGate(id, newStatus);
        toast(newStatus ? "Feature enabled" : "Feature disabled", { description: feature.name });
      } catch (err: unknown) {
        // Revert on failure
        setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, status: !newStatus } : f)));
        const message = err instanceof Error ? err.message : "Failed to update";
        toast.error("Update failed", { description: message });
      }
    } else {
      toast(newStatus ? "Feature enabled" : "Feature disabled", {
        description: `${feature.name} (local only)`,
      });
    }
  };

  const handleLogin = (walletAddress: string, label: string) => {
    setAdminWallet(walletAddress);
    setAdminLabel(label);
    loadFeatures();
  };

  const handleLogout = () => {
    clearStoredToken();
    setAdminWallet(null);
    setAdminLabel("");
    toast("Logged out", { description: "Admin session ended" });
  };

  const isAdmin = !!adminWallet;

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber/10">
              <ToggleLeft className="w-6 h-6 text-amber" />
            </div>
            <h1 className="text-2xl font-bold">Feature Gates</h1>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">
                    {adminLabel || `${adminWallet!.slice(0, 6)}...${adminWallet!.slice(-4)}`}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1 text-muted-foreground text-xs">
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </Button>
              </>
            ) : (
              <WalletLoginDialog onLoginSuccess={handleLogin} />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadFeatures}
              disabled={loading}
              className="text-muted-foreground"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {!apiAvailable && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-secondary/50 border border-border text-xs text-muted-foreground">
            ⚠️ Feature Gate Service not connected. Showing default states. Changes are local only.
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {features.map((f) => (
            <div key={f.id} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
              {f.status ? (
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
              {isAdmin ? (
                <Switch checked={f.status} onCheckedChange={() => handleToggle(f.id)} />
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full ${f.status ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {f.status ? "Active" : "Inactive"}
                </span>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default FeatureGates;
