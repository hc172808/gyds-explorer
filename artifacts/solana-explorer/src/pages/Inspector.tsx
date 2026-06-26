import { motion } from "framer-motion";
import { Search, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

const Inspector = () => {
  const [input, setInput] = useState("");
  const navigate = useNavigate();

  const handleInspect = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    if (q.length === 66 && q.startsWith("0x")) {
      navigate(`/tx/${q}`);
    } else if (q.length === 42 && q.startsWith("0x")) {
      navigate(`/address/${q}`);
    } else if (/^\d+$/.test(q)) {
      navigate(`/block/${parseInt(q)}`);
    } else if (q.startsWith("0x")) {
      navigate(`/block/${q}`);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Search className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Transaction Inspector</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <p className="text-muted-foreground text-sm mb-4">
            Inspect any transaction, address, or block on the GYDS network. Enter a hash, address, or block number below.
          </p>
          <form onSubmit={handleInspect} className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter tx hash, address, or block number..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Inspect
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default Inspector;
