import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { Blocks, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { getBlock, hexToNumber, timeAgo, formatAddress } from "@/lib/rpc";

const BLOCKS_PER_PAGE = 25;

async function getBlocksPage(page: number, latestBlock: number) {
  const start = latestBlock - (page - 1) * BLOCKS_PER_PAGE;
  const promises = Array.from({ length: BLOCKS_PER_PAGE }, (_, i) => {
    const num = start - i;
    if (num < 0) return null;
    return getBlock("0x" + num.toString(16), false);
  }).filter(Boolean);
  const blocks = await Promise.all(promises);
  return blocks.filter(Boolean);
}

const AllBlocks = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get("page") || "1");

  const { data: latestBlockHex } = useQuery({
    queryKey: ["latestBlockNumber"],
    queryFn: async () => {
      const res = await fetch("https://rpc.netlifegy.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: Date.now() }),
      });
      const data = await res.json();
      return data.result as string;
    },
    refetchInterval: 10000,
  });

  const latestBlock = latestBlockHex ? hexToNumber(latestBlockHex) : 0;
  const totalPages = Math.ceil((latestBlock + 1) / BLOCKS_PER_PAGE);

  const { data: blocks, isLoading } = useQuery({
    queryKey: ["allBlocks", page, latestBlock],
    queryFn: () => getBlocksPage(page, latestBlock),
    enabled: latestBlock > 0,
    refetchInterval: page === 1 ? 10000 : false,
  });

  const goToPage = (p: number) => {
    setSearchParams({ page: p.toString() });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/" className="text-primary hover:underline text-sm flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-6">
          <Blocks className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">All Blocks</h1>
          {latestBlock > 0 && (
            <span className="text-sm text-muted-foreground ml-auto">
              Total: {latestBlock.toLocaleString()} blocks
            </span>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-5 gap-2 px-4 py-3 bg-secondary/30 text-xs text-muted-foreground font-medium border-b border-border">
            <span>Block</span>
            <span className="hidden sm:block">Age</span>
            <span>Txns</span>
            <span className="hidden md:block">Miner</span>
            <span className="text-right">Gas Used</span>
          </div>

          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-border/50">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-4 bg-secondary/50 rounded animate-pulse" />
                ))}
              </div>
            ))
          ) : (
            (blocks ?? []).map((block) => (
              <Link
                key={block.hash}
                to={`/block/${hexToNumber(block.number)}`}
                className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors text-sm"
              >
                <span className="text-primary font-mono">{hexToNumber(block.number).toLocaleString()}</span>
                <span className="text-muted-foreground hidden sm:block">{timeAgo(block.timestamp)}</span>
                <span className="text-foreground">
                  {Array.isArray(block.transactions) ? block.transactions.length : 0}
                </span>
                <span className="text-muted-foreground font-mono hidden md:block">
                  {formatAddress(block.miner)}
                </span>
                <span className="text-right text-muted-foreground font-mono">
                  {hexToNumber(block.gasUsed).toLocaleString()}
                </span>
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => goToPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-secondary text-sm text-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          <div className="flex items-center gap-1">
            {page > 2 && (
              <button onClick={() => goToPage(1)} className="px-3 py-1 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50">1</button>
            )}
            {page > 3 && <span className="text-muted-foreground px-1">…</span>}
            {page > 1 && (
              <button onClick={() => goToPage(page - 1)} className="px-3 py-1 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50">{page - 1}</button>
            )}
            <span className="px-3 py-1 rounded text-sm bg-primary text-primary-foreground font-medium">{page}</span>
            {page < totalPages && (
              <button onClick={() => goToPage(page + 1)} className="px-3 py-1 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50">{page + 1}</button>
            )}
            {page < totalPages - 2 && <span className="text-muted-foreground px-1">…</span>}
            {page < totalPages - 1 && totalPages > 1 && (
              <button onClick={() => goToPage(totalPages)} className="px-3 py-1 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50">{totalPages}</button>
            )}
          </div>

          <button
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-secondary text-sm text-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AllBlocks;
