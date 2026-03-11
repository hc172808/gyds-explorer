import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useState } from "react";

const Header = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
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
    setQuery("");
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm font-mono">G</span>
          </div>
          <span className="text-lg font-bold">
            <span className="text-primary glow-text">GYDS</span>
            <span className="text-muted-foreground ml-1 text-sm font-normal">Explorer</span>
          </span>
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by Address / Tx Hash / Block"
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
            />
          </div>
        </form>

        <div className="hidden sm:flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-xs">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse-neon" />
            <span className="text-muted-foreground">GYDS Network</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
