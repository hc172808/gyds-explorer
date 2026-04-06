import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ToggleLeft, ArrowLeft, CheckCircle, XCircle, Shield, ShieldOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const DEFAULT_FEATURES = [
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

const STORAGE_KEY = "gyds-feature-gates";
const ADMIN_KEY = "gyds-admin-mode";

const FeatureGates = () => {
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem(ADMIN_KEY) === "true";
  });

  const [features, setFeatures] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        return DEFAULT_FEATURES.map((f) => ({
          ...f,
          status: parsed[f.id] !== undefined ? parsed[f.id] : f.status,
        }));
      } catch {
        return DEFAULT_FEATURES;
      }
    }
    return DEFAULT_FEATURES;
  });

  useEffect(() => {
    const statuses: Record<string, boolean> = {};
    features.forEach((f) => (statuses[f.id] = f.status));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
  }, [features]);

  useEffect(() => {
    localStorage.setItem(ADMIN_KEY, String(isAdmin));
  }, [isAdmin]);

  const toggleFeature = (id: string) => {
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          const newStatus = !f.status;
          toast(newStatus ? "Feature enabled" : "Feature disabled", {
            description: f.name,
          });
          return { ...f, status: newStatus };
        }
        return f;
      })
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber/10">
              <ToggleLeft className="w-6 h-6 text-amber" />
            </div>
            <h1 className="text-2xl font-bold">Feature Gates</h1>
          </div>

          <button
            onClick={() => setIsAdmin(!isAdmin)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isAdmin
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-secondary text-muted-foreground border border-border"
            }`}
          >
            {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
            {isAdmin ? "Admin Mode" : "View Mode"}
          </button>
        </div>

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
                <Switch checked={f.status} onCheckedChange={() => toggleFeature(f.id)} />
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
