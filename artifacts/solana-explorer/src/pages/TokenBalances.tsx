import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, Search, Loader2, RefreshCw, ExternalLink, AlertCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNetwork } from "@/contexts/NetworkContext";
import { fetchTokenBalances, type TokenBalance } from "@/lib/useTokenDeploy";
import { JsonRpcProvider, formatEther } from "ethers";

function fmt(raw: bigint, decimals: number, maxDecimals = 6): string {
  if (raw === 0n) return "0";
  const d    = BigInt(10) ** BigInt(decimals);
  const whole = raw / d;
  const frac  = raw % d;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, maxDecimals);
  return `${whole.toLocaleString()}.${fracStr}`;
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function TokenBalances() {
  const { address: paramAddress } = useParams<{ address?: string }>();
  const navigate = useNavigate();
  const { primaryRpc } = useNetwork();
  const rpcUrl = primaryRpc || import.meta.env.VITE_RPC_URL || "https://rpc.netlifegy.com";

  const [inputAddress, setInputAddress] = useState(paramAddress ?? "");
  const [activeAddress, setActiveAddress] = useState(paramAddress ?? "");

  // Registered tokens from localStorage
  const [registeredTokens, setRegisteredTokens] = useState<{ address: string; name: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("gyds_deployed_tokens") || "[]"); }
    catch { return []; }
  });

  const [nativeBalance, setNativeBalance]       = useState<bigint | null>(null);
  const [tokenBalances, setTokenBalances]       = useState<TokenBalance[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [lastFetched, setLastFetched]           = useState<Date | null>(null);

  const isValidAddress = (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr);

  const lookup = async (addr: string) => {
    if (!isValidAddress(addr)) {
      setError("Enter a valid 0x wallet address (42 characters).");
      return;
    }
    setLoading(true);
    setError(null);
    setNativeBalance(null);
    setTokenBalances([]);

    try {
      const provider = new JsonRpcProvider(rpcUrl);

      const [native, tokens] = await Promise.all([
        provider.getBalance(addr),
        registeredTokens.length > 0
          ? fetchTokenBalances(addr, registeredTokens.map((t) => t.address), rpcUrl)
          : Promise.resolve([]),
      ]);

      setNativeBalance(native);
      setTokenBalances(tokens);
      setLastFetched(new Date());
      navigate(`/tokens/${addr}`, { replace: true });
    } catch (e: any) {
      setError(e.message?.slice(0, 120) ?? "Failed to fetch balances.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveAddress(inputAddress.trim());
    lookup(inputAddress.trim());
  };

  // Auto-lookup if we have a URL param
  useEffect(() => {
    if (paramAddress && isValidAddress(paramAddress)) {
      setInputAddress(paramAddress);
      setActiveAddress(paramAddress);
      lookup(paramAddress);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

        {/* Header */}
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Coins className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Token Balances</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Look up GYDS and ERC-20 token balances for any wallet address
              </p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputAddress}
            onChange={(e) => setInputAddress(e.target.value)}
            placeholder="0x wallet address"
            className="font-mono text-sm flex-1"
          />
          <Button type="submit" disabled={loading} className="gap-1.5 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Look up
          </Button>
        </form>

        {/* No registered tokens warning */}
        {registeredTokens.length === 0 && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-sm">
            <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-300">No ERC-20 tokens registered yet</p>
              <p className="text-muted-foreground text-xs mt-1">
                Go to <Link to="/admin" className="text-primary hover:underline">Admin → Tokens</Link> to deploy or register token contract addresses.
                Native GYDS balance will still be shown.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-destructive">{error}</p>
          </div>
        )}

        {/* Results */}
        {!loading && nativeBalance !== null && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <span className="font-mono text-sm text-muted-foreground">{activeAddress}</span>
                <Link to={`/address/${activeAddress}`} className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                  View on explorer <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <button
                onClick={() => lookup(activeAddress)}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>

            {/* Native GYDS balance */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">G</div>
              <div className="flex-1">
                <p className="text-sm font-medium">GYDS (Native Coin)</p>
                <p className="text-xs text-muted-foreground font-mono">Native chain currency · Chain ID 29987</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold font-mono">{fmt(nativeBalance, 18)} <span className="text-sm text-muted-foreground">GYDS</span></p>
                <p className="text-xs text-muted-foreground">{nativeBalance.toString()} wei</p>
              </div>
            </div>

            {/* ERC-20 tokens */}
            {tokenBalances.length > 0 ? (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">ERC-20 Tokens</span>
                  <span className="ml-auto text-xs text-muted-foreground">{tokenBalances.length} token{tokenBalances.length !== 1 ? "s" : ""} checked</span>
                </div>
                <div className="divide-y divide-border">
                  {tokenBalances.map((t) => (
                    <div key={t.contractAddress} className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/20 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {t.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{t.name}</p>
                          <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{t.symbol}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Link
                            to={`/address/${t.contractAddress}`}
                            className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                          >
                            {shortAddr(t.contractAddress)}
                          </Link>
                          <span className="text-xs text-muted-foreground">· {t.decimals} decimals</span>
                          {t.error && <span className="text-xs text-destructive">Error: {t.error}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-base font-bold font-mono ${t.balance === 0n ? "text-muted-foreground" : ""}`}>
                          {fmt(t.balance, t.decimals)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.symbol}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : registeredTokens.length > 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No ERC-20 token balances found for this address.
              </div>
            ) : null}

            {lastFetched && (
              <p className="text-xs text-muted-foreground text-center">
                Last updated {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && nativeBalance === null && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <Coins className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-sm">Enter a wallet address above to look up balances</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Fetching balances from the GYDS network…</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
