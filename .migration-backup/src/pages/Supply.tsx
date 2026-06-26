import { motion } from "framer-motion";
import { Coins, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getNetworkStats } from "@/lib/rpc";
import { GYDS_COIN, GYD_COIN } from "@/lib/coins";

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
          <h1 className="text-2xl font-bold">Network Supply</h1>
        </div>

        {/* GYDS Section */}
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-primary">●</span> {GYDS_COIN.name}
          <span className="text-xs text-muted-foreground font-normal">Native Coin</span>
        </h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          {[
            { label: "Token Symbol", value: GYDS_COIN.symbol },
            { label: "Decimals", value: String(GYDS_COIN.decimals) },
            { label: "Type", value: "Native Coin" },
            { label: "Total Supply", value: "Unlimited (PoA Network)" },
            { label: "Current Block Height", value: isLoading ? "..." : stats?.blockNumber.toLocaleString() ?? "—" },
            { label: "Chain ID", value: isLoading ? "..." : String(stats?.chainId ?? "—") },
            { label: "Network Peers", value: isLoading ? "..." : String(stats?.peerCount ?? 0) },
          ].map((f) => (
            <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
              <div className="px-5 py-3 sm:w-56 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
              <div className="px-5 py-3 text-sm font-mono">{f.value}</div>
            </div>
          ))}
        </div>

        {/* GYD Section */}
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-primary">●</span> {GYD_COIN.name}
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-normal">Stablecoin</span>
        </h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {[
            { label: "Token Symbol", value: GYD_COIN.symbol },
            { label: "Decimals", value: String(GYD_COIN.decimals) },
            { label: "Type", value: "Stablecoin" },
            { label: "Description", value: GYD_COIN.description },
          ].map((f) => (
            <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
              <div className="px-5 py-3 sm:w-56 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
              <div className="px-5 py-3 text-sm font-mono">{f.value}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Supply;
