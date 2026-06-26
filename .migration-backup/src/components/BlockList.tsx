import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Boxes } from "lucide-react";
import { Block } from "@/lib/types";
import { hexToNumber, formatAddress, timeAgo } from "@/lib/rpc";

interface BlockListProps {
  blocks: Block[];
  loading?: boolean;
}

const BlockList = ({ blocks, loading }: BlockListProps) => (
  <div className="bg-card border border-border rounded-xl overflow-hidden">
    <div className="px-5 py-4 border-b border-border flex items-center gap-2">
      <Boxes className="w-4 h-4 text-primary" />
      <h2 className="font-semibold text-sm">Latest Blocks</h2>
    </div>
    <div className="divide-y divide-border">
      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-5 py-3 animate-pulse">
            <div className="h-4 bg-secondary rounded w-1/3 mb-2" />
            <div className="h-3 bg-secondary rounded w-2/3" />
          </div>
        ))
      ) : (
        blocks.map((block, i) => (
          <motion.div
            key={block.hash}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="px-5 py-3 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Boxes className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Link
                    to={`/block/${hexToNumber(block.number)}`}
                    className="text-sm font-mono font-medium text-primary hover:underline"
                  >
                    #{hexToNumber(block.number).toLocaleString()}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {timeAgo(block.timestamp)} · Miner {formatAddress(block.miner)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono text-muted-foreground">
                  {Array.isArray(block.transactions) ? block.transactions.length : 0} txns
                </p>
                <p className="text-xs text-muted-foreground">
                  {(hexToNumber(block.gasUsed) / hexToNumber(block.gasLimit) * 100).toFixed(1)}% gas
                </p>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
    <Link
      to="/blocks"
      className="block text-center py-3 text-xs text-primary hover:bg-secondary/50 transition-colors border-t border-border"
    >
      View All Blocks →
    </Link>
  </div>
);

export default BlockList;
