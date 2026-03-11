import { motion } from "framer-motion";
import { ToggleLeft, ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

const FEATURES = [
  { name: "EIP-1559 Base Fee", status: true, description: "Dynamic base fee per gas mechanism" },
  { name: "EIP-2930 Access Lists", status: true, description: "Optional access lists for transactions" },
  { name: "EIP-3855 PUSH0", status: true, description: "PUSH0 opcode support" },
  { name: "SiMD-296 Protocol", status: true, description: "GYDS network consensus enhancement" },
  { name: "Shanghai Upgrade", status: true, description: "Beacon chain withdrawal support" },
  { name: "Account Abstraction (EIP-4337)", status: false, description: "Smart contract wallets as first-class accounts" },
  { name: "Verkle Trees", status: false, description: "Verkle tree state commitment scheme" },
  { name: "EOF (EVM Object Format)", status: false, description: "Structured bytecode container format" },
];

const FeatureGates = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-amber/10">
            <ToggleLeft className="w-6 h-6 text-amber" />
          </div>
          <h1 className="text-2xl font-bold">Feature Gates</h1>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {FEATURES.map((f) => (
            <div key={f.name} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
              {f.status ? (
                <CheckCircle className="w-5 h-5 text-primary shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${f.status ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                {f.status ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default FeatureGates;
