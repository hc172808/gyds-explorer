import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRightLeft } from "lucide-react";
import { Transaction } from "@/lib/types";
import { formatAddress, weiToEther, hexToNumber } from "@/lib/rpc";

interface TransactionListProps {
  transactions: Transaction[];
  loading?: boolean;
}

const TransactionList = ({ transactions, loading }: TransactionListProps) => (
  <div className="bg-card border border-border rounded-xl overflow-hidden">
    <div className="px-5 py-4 border-b border-border flex items-center gap-2">
      <ArrowRightLeft className="w-4 h-4 text-cyan" />
      <h2 className="font-semibold text-sm">Latest Transactions</h2>
    </div>
    <div className="divide-y divide-border">
      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-5 py-3 animate-pulse">
            <div className="h-4 bg-secondary rounded w-1/3 mb-2" />
            <div className="h-3 bg-secondary rounded w-2/3" />
          </div>
        ))
      ) : transactions.length === 0 ? (
        <div className="px-5 py-8 text-center text-muted-foreground text-sm">No transactions found</div>
      ) : (
        transactions.map((tx, i) => (
          <motion.div
            key={tx.hash}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="px-5 py-3 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
                  <ArrowRightLeft className="w-4 h-4 text-cyan" />
                </div>
                <div className="min-w-0">
                  <Link
                    to={`/tx/${tx.hash}`}
                    className="text-sm font-mono font-medium text-primary hover:underline truncate block max-w-[200px]"
                  >
                    {formatAddress(tx.hash)}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    From {formatAddress(tx.from)} → {tx.to ? formatAddress(tx.to) : "Contract Creation"}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono">{weiToEther(tx.value)} GYDS</p>
                <p className="text-xs text-muted-foreground">Block #{hexToNumber(tx.blockNumber).toLocaleString()}</p>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  </div>
);

export default TransactionList;
