import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Blocks, ArrowRightLeft, Wallet, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SearchResult {
  type: "block" | "transaction" | "address";
  data: Record<string, unknown>;
}

const API_URL = import.meta.env.VITE_API_URL || "";

const SearchBar = () => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [showResult, setShowResult] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResult(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    // Try local pattern matching first (instant navigation)
    if (q.length === 66 && q.startsWith("0x")) {
      navigate(`/tx/${q}`);
      resetState();
      return;
    }
    if (q.length === 42 && q.startsWith("0x")) {
      navigate(`/address/${q}`);
      resetState();
      return;
    }
    if (/^\d+$/.test(q)) {
      navigate(`/block/${parseInt(q)}`);
      resetState();
      return;
    }

    // Query the API search endpoint
    if (API_URL) {
      setLoading(true);
      setError("");
      setResult(null);
      try {
        const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Not found" }));
          setError(errData.error || "No results found");
          setShowResult(true);
          return;
        }
        const data: SearchResult = await res.json();
        setResult(data);
        setShowResult(true);
      } catch {
        setError("Search service unavailable — using local navigation");
        setShowResult(true);
        // Fallback: try to navigate based on pattern
        if (q.startsWith("0x")) navigate(`/block/${q}`);
      } finally {
        setLoading(false);
      }
    } else {
      // No API configured, use pattern-based navigation
      if (q.startsWith("0x")) navigate(`/block/${q}`);
      resetState();
    }
  };

  const resetState = () => {
    setQuery("");
    setShowResult(false);
    setResult(null);
    setError("");
  };

  const navigateToResult = (res: SearchResult) => {
    switch (res.type) {
      case "block":
        navigate(`/block/${res.data.number || res.data.hash}`);
        break;
      case "transaction":
        navigate(`/tx/${res.data.hash}`);
        break;
      case "address":
        navigate(`/address/${res.data.address}`);
        break;
    }
    resetState();
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "block": return <Blocks className="w-4 h-4 text-primary" />;
      case "transaction": return <ArrowRightLeft className="w-4 h-4 text-primary" />;
      case "address": return <Wallet className="w-4 h-4 text-primary" />;
      default: return null;
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-2xl mx-auto">
      <form onSubmit={handleSearch}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Block Number / Tx Hash / Address"
            className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-secondary/80 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono backdrop-blur-sm"
          />
          {loading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground animate-spin" />
          )}
          {!loading && query && (
            <button
              type="button"
              onClick={resetState}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      <AnimatePresence>
        {showResult && (result || error) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
          >
            {error ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">{error}</div>
            ) : result ? (
              <button
                onClick={() => navigateToResult(result)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
              >
                {typeIcon(result.type)}
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-primary uppercase">{result.type}</span>
                  <p className="text-sm font-mono text-foreground truncate">
                    {result.type === "block" && `Block #${result.data.number}`}
                    {result.type === "transaction" && `${String(result.data.hash).slice(0, 20)}...`}
                    {result.type === "address" && `${String(result.data.address).slice(0, 20)}...`}
                  </p>
                </div>
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;
