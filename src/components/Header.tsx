import { Link, useNavigate } from "react-router-dom";
import { Search, Menu, X, Github, Globe, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNetwork, NetworkType } from "@/contexts/NetworkContext";

const NETWORK_OPTIONS: { label: string; value: NetworkType; color: string }[] = [
  { label: "Mainnet", value: "mainnet", color: "bg-primary" },
  { label: "Testnet", value: "testnet", color: "bg-amber" },
  { label: "Devnet", value: "devnet", color: "bg-cyan" },
  { label: "Custom RPC", value: "custom", color: "bg-muted-foreground" },
];

const NAV_LINKS = [
  { label: "Programs", to: "/programs" },
  { label: "Supply", to: "/supply" },
  { label: "Inspector", to: "/inspector" },
  { label: "SiMD-296", to: "/simd-296" },
  { label: "Feature Gates", to: "/feature-gates" },
  { label: "ToS", to: "/terms" },
];

const Header = () => {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const navigate = useNavigate();
  const { networkType, setNetworkType, customRpcUrl, setCustomRpcUrl } = useNetwork();

  const currentNetwork = NETWORK_OPTIONS.find((n) => n.value === networkType)!;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (q.length === 66 && q.startsWith("0x")) navigate(`/tx/${q}`);
    else if (q.length === 42 && q.startsWith("0x")) navigate(`/address/${q}`);
    else if (/^\d+$/.test(q)) navigate(`/block/${parseInt(q)}`);
    else if (q.startsWith("0x")) navigate(`/block/${q}`);
    setQuery("");
    setMobileOpen(false);
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-50">
      {/* Top bar */}
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm font-mono">G</span>
          </div>
          <span className="text-lg font-bold">
            <span className="text-primary glow-text">GYDS</span>
            <span className="text-muted-foreground ml-1 text-sm font-normal hidden sm:inline">Explorer</span>
          </span>
        </Link>

        {/* Search - desktop */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden md:block">
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

        <div className="flex items-center gap-2">
          {/* Network selector */}
          <div className="relative">
            <button
              onClick={() => setNetworkOpen(!networkOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-xs hover:bg-secondary/80 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${currentNetwork.color} animate-pulse-neon`} />
              <span className="text-foreground hidden sm:inline">{currentNetwork.label}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {networkOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNetworkOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                  {NETWORK_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setNetworkType(opt.value);
                        if (opt.value !== "custom") setNetworkOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors ${
                        networkType === opt.value ? "bg-secondary/30 text-primary" : "text-foreground"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                      {opt.label}
                    </button>
                  ))}
                  {networkType === "custom" && (
                    <div className="px-4 py-3 border-t border-border">
                      <input
                        value={customRpcUrl}
                        onChange={(e) => setCustomRpcUrl(e.target.value)}
                        placeholder="https://your-rpc-url.com"
                        className="w-full px-3 py-1.5 rounded-md bg-secondary border border-border text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* GitHub link */}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            title="GitHub"
          >
            <Github className="w-4 h-4" />
          </a>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Nav bar - desktop */}
      <nav className="hidden md:block border-t border-border bg-card/50">
        <div className="container mx-auto px-4 flex items-center gap-1 py-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-secondary/50 rounded-md transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-secondary/50 rounded-md transition-colors ml-auto flex items-center gap-1"
          >
            <Globe className="w-3 h-3" />
            Source Code
          </a>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="p-4">
            <form onSubmit={handleSearch} className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by Address / Tx Hash / Block"
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>
            </form>
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-secondary/50 rounded-md transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-secondary/50 rounded-md transition-colors flex items-center gap-2"
              >
                <Github className="w-4 h-4" />
                GitHub Source
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
