import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, UserPlus, Trash2, Wallet, Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getStoredToken } from "@/lib/featureGateApi";
import WalletLoginDialog from "@/components/WalletLoginDialog";

const API_BASE = import.meta.env.VITE_FEATURE_GATE_URL || "http://localhost:3002";

interface AdminWallet {
  id: number;
  wallet_address: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

const AdminDashboard = () => {
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setIsAuthenticated(true);
      fetchWallets();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/wallets`, { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          toast.error("Session expired", { description: "Please login again" });
          return;
        }
        throw new Error("Failed to fetch wallets");
      }
      const data = await res.json();
      setWallets(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load wallets";
      toast.error("Error", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const addWallet = async () => {
    if (!newAddress || !/^0x[a-fA-F0-9]{40}$/.test(newAddress)) {
      toast.error("Invalid address", { description: "Enter a valid wallet address (0x...)" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/wallets`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ walletAddress: newAddress, label: newLabel || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add wallet");
      }
      toast.success("Wallet added", { description: `${newAddress.slice(0, 10)}...` });
      setNewAddress("");
      setNewLabel("");
      fetchWallets();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add";
      toast.error("Error", { description: message });
    } finally {
      setAdding(false);
    }
  };

  const removeWallet = async (id: number, address: string) => {
    if (!confirm(`Remove admin wallet ${address.slice(0, 10)}...?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/wallets/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to remove wallet");
      }
      toast.success("Wallet removed");
      fetchWallets();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to remove";
      toast.error("Error", { description: message });
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
    } catch {
      toast.error("Failed to update wallet status");
    }
  };

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
              Connect your authorized GYDS wallet to manage admin wallets.
            </p>
            <WalletLoginDialog
              onLoginSuccess={() => {
                setIsAuthenticated(true);
                fetchWallets();
              }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchWallets} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Add New Wallet */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
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
          <div className="px-5 py-3 border-b border-border bg-secondary/30">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Authorized Admin Wallets
              <span className="text-muted-foreground font-normal">({wallets.length})</span>
            </h2>
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
                {w.is_active ? (
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono break-all">{w.wallet_address}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {w.label && <span className="text-xs text-muted-foreground">{w.label}</span>}
                    <span className="text-xs text-muted-foreground">
                      Added {new Date(w.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleWallet(w.id, w.is_active)}
                    className="text-xs"
                  >
                    {w.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeWallet(w.id, w.wallet_address)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
