import { motion } from "framer-motion";
import { Coins, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getNetworkStats } from "@/lib/rpc";
import { GYD_COIN, getNativeCoinForNetwork, getTokenCoinForNetwork } from "@/lib/coins";
import { useNetwork } from "@/contexts/NetworkContext";

const Supply = () => {
  const { network, networkType } = useNetwork();
  const nativeCoin = getNativeCoinForNetwork(networkType);
  const assetCoin = getTokenCoinForNetwork(networkType);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["networkStats", networkType],
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

        {/* Native coin section */}
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="text-primary">●</span> {nativeCoin.name}
          <span className="text-xs text-muted-foreground font-normal">Native Coin</span>
        </h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          {[
            { label: "Token Symbol", value: nativeCoin.symbol },
            { label: "Decimals", value: String(nativeCoin.decimals) },
            { label: "Type", value: "Native Coin" },
            { label: "Configured Genesis Supply", value: networkType === "testnet" ? "1,000,000 TGYDS" : networkType === "mainnet" ? "1,000,000,000 GYDS" : "Not available from RPC" },
            ...(networkType === "testnet" ? [{ label: "Admin Genesis Allocation", value: "5,000 TGYDS (configured in the node environment)" }] : []),
            { label: "Current Block Height", value: isLoading ? "..." : stats?.blockNumber.toLocaleString() ?? "—" },
            { label: "Chain ID", value: String(network.chainId ?? (isLoading ? "..." : (stats?.chainId ?? "—"))) },
            { label: "Network Peers", value: isLoading ? "..." : String(stats?.peerCount ?? 0) },
          ].map((f) => (
            <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
              <div className="px-5 py-3 sm:w-56 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
              <div className="px-5 py-3 text-sm font-mono">{f.value}</div>
            </div>
          ))}
        </div>

        {assetCoin && (
          <>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-primary">●</span> {assetCoin.name}
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-normal">
                {networkType === "testnet" ? "Testnet token · no peg" : "Stablecoin"}
              </span>
            </h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {[
                { label: "Token Symbol", value: assetCoin.symbol },
                { label: "Decimals", value: String(assetCoin.decimals) },
                { label: "Type", value: networkType === "testnet" ? "Testnet ERC-20" : "Stablecoin" },
                { label: networkType === "testnet" ? "Initial Supply / Hard Cap" : "Description", value: networkType === "testnet" ? "5,000 TGYD initial supply; 1,000,000 TGYD immutable cap" : GYD_COIN.description },
                ...(networkType === "testnet" ? [{ label: "Value Status", value: "Testnet only; no USD peg or backing" }] : []),
              ].map((f) => (
                <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
                  <div className="px-5 py-3 sm:w-56 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
                  <div className="px-5 py-3 text-sm font-mono">{f.value}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default Supply;
