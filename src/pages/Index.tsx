import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Blocks, Fuel, Link2, Users, ArrowRight } from "lucide-react";
import StatCard from "@/components/StatCard";
import BlockList from "@/components/BlockList";
import TransactionList from "@/components/TransactionList";
import { getNetworkStats, getLatestBlocks, gweiFromWei, hexToNumber } from "@/lib/rpc";
import { Transaction } from "@/lib/types";

const Index = () => {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["networkStats"],
    queryFn: getNetworkStats,
    refetchInterval: 3000,
  });

  const { data: blocks, isLoading: blocksLoading } = useQuery({
    queryKey: ["latestBlocks"],
    queryFn: () => getLatestBlocks(10),
    refetchInterval: 3000,
  });

  // Extract transactions from blocks
  const recentTxs: Transaction[] = (blocks ?? [])
    .flatMap((b) =>
      Array.isArray(b.transactions)
        ? b.transactions.filter((t): t is Transaction => typeof t === "object")
        : []
    )
    .slice(0, 10);

  return (
    <div className="min-h-0">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="container mx-auto px-4 py-12 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              <span className="gradient-text">GYDS</span> Network Explorer
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Explore blocks, transactions, and addresses on the GYDS blockchain network
            </p>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Block Height"
              value={statsLoading ? "..." : (stats?.blockNumber.toLocaleString() ?? "—")}
              icon={Blocks}
            />
            <StatCard
              label="Gas Price"
              value={statsLoading ? "..." : `${gweiFromWei(stats?.gasPrice ?? "0x0")} Gwei`}
              icon={Fuel}
            />
            <StatCard
              label="Chain ID"
              value={statsLoading ? "..." : (stats?.chainId ?? "—")}
              icon={Link2}
            />
            <StatCard
              label="Peers"
              value={statsLoading ? "..." : (stats?.peerCount ?? 0)}
              icon={Users}
            />
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-6">
          <BlockList blocks={blocks ?? []} loading={blocksLoading} />
          <TransactionList transactions={recentTxs} loading={blocksLoading} />
        </div>
      </section>
    </div>
  );
};

export default Index;
