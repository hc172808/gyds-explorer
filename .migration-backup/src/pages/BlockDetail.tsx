import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Boxes } from "lucide-react";
import { getBlock, hexToNumber, formatTimestamp, formatAddress, gweiFromWei } from "@/lib/rpc";
import { Transaction } from "@/lib/types";

const BlockDetail = () => {
  const { id } = useParams<{ id: string }>();
  const blockId = id?.startsWith("0x") ? id : `0x${parseInt(id ?? "0").toString(16)}`;

  const { data: block, isLoading } = useQuery({
    queryKey: ["block", blockId],
    queryFn: () => getBlock(blockId, true),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-secondary rounded w-1/3" />
          <div className="h-64 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Block not found</p>
      </div>
    );
  }

  const txs = Array.isArray(block.transactions)
    ? block.transactions.filter((t): t is Transaction => typeof t === "object")
    : [];

  const fields = [
    { label: "Block Height", value: hexToNumber(block.number).toLocaleString() },
    { label: "Timestamp", value: formatTimestamp(block.timestamp) },
    { label: "Transactions", value: `${txs.length} transactions` },
    { label: "Miner", value: block.miner, mono: true, link: `/address/${block.miner}` },
    { label: "Gas Used", value: `${hexToNumber(block.gasUsed).toLocaleString()} / ${hexToNumber(block.gasLimit).toLocaleString()}` },
    { label: "Gas Price", value: block.baseFeePerGas ? `${gweiFromWei(block.baseFeePerGas)} Gwei` : "N/A" },
    { label: "Hash", value: block.hash, mono: true },
    { label: "Parent Hash", value: block.parentHash, mono: true },
    { label: "Size", value: `${hexToNumber(block.size).toLocaleString()} bytes` },
    { label: "Nonce", value: block.nonce, mono: true },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Boxes className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Block #{hexToNumber(block.number).toLocaleString()}</h1>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
          {fields.map((f) => (
            <div key={f.label} className="flex flex-col sm:flex-row border-b border-border last:border-0">
              <div className="px-5 py-3 sm:w-48 text-sm text-muted-foreground bg-secondary/30 shrink-0">{f.label}</div>
              <div className={`px-5 py-3 text-sm break-all ${f.mono ? "font-mono" : ""}`}>
                {f.link ? (
                  <Link to={f.link} className="text-primary hover:underline">{f.value}</Link>
                ) : f.value}
              </div>
            </div>
          ))}
        </div>

        {txs.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">Transactions ({txs.length})</h2>
            </div>
            <div className="divide-y divide-border">
              {txs.map((tx) => (
                <div key={tx.hash} className="px-5 py-3 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Link to={`/tx/${tx.hash}`} className="text-sm font-mono text-primary hover:underline truncate max-w-[280px]">
                      {tx.hash}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      <Link to={`/address/${tx.from}`} className="hover:text-primary">{formatAddress(tx.from)}</Link>
                      {" → "}
                      {tx.to ? (
                        <Link to={`/address/${tx.to}`} className="hover:text-primary">{formatAddress(tx.to)}</Link>
                      ) : "Contract Creation"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default BlockDetail;
