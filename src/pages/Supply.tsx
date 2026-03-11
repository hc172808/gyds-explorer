import { motion } from "framer-motion";
import { Coins, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getNetworkStats } from "@/lib/rpc";

const Supply = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["networkStats"],
    queryFn: getNetworkStats,
    refetchInterval: 10000,
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Coins className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">GYDS Supply</h1>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {[
            { label: "Current Block Height", value: isLoading ? "..." : stats?.blockNumber.toLocaleString() ?? "—" },
            { label: "Chain ID", value: isLoading ? "..." : stats?.chainId ?? "—" },
            { label: "Network Peers", value: isLoading ? "..." : stats?.peerCount ?? 0 },
            { label: "Total Supply", value: "Unlimited (PoA Network)" },
            { label: "Token Symbol", value: "GYDS" },
            { label: "Decimals", value: "18" },
          ].map((f) => (
            <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
              <div className="px-5 py-3 sm:w-56 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
              <div className="px-5 py-3 text-sm font-mono">{String(f.value)}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Supply;
