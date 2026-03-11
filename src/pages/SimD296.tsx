import { motion } from "framer-motion";
import { Cpu, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const SimD296 = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-cyan/10">
            <Cpu className="w-6 h-6 text-cyan" />
          </div>
          <h1 className="text-2xl font-bold">SiMD-296 Protocol</h1>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {[
              { label: "Protocol", value: "SiMD-296" },
              { label: "Status", value: "Active" },
              { label: "Network", value: "GYDS Mainnet" },
              { label: "Type", value: "Consensus Enhancement" },
              { label: "Description", value: "SiMD-296 is a consensus-level protocol enhancement for the GYDS network that optimizes block validation, improves finality guarantees, and reduces latency in transaction processing." },
            ].map((f) => (
              <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
                <div className="px-5 py-3 sm:w-48 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
                <div className="px-5 py-3 text-sm">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SimD296;
