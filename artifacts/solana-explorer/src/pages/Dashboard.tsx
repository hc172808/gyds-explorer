import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { JsonRpcProvider, formatUnits } from "ethers";
import { ArrowRight, Coins, Copy, Loader2, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useNetwork } from "@/contexts/NetworkContext";
import { clearSession, getStoredSession, type WalletSession } from "@/lib/session";
import { fetchCoinSettings, type CoinSetting } from "@/lib/networkApi";

const DEFAULT_COINS: CoinSetting[] = [
  { symbol: "GYDS", name: "GYDSChain", decimals: 18, logoUrl: "/assets/gyds-logo.svg", description: "" },
  { symbol: "GYD", name: "GYD", decimals: 6, logoUrl: "/assets/gyd-logo.svg", description: "" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { primaryRpc, network } = useNetwork();
  const [session, setSession] = useState<WalletSession | null>(null);
  const [coins, setCoins] = useState<CoinSetting[]>(DEFAULT_COINS);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      navigate("/", { replace: true });
      return;
    }
    setSession(stored);
    fetchCoinSettings()
      .then((list) => list.length && setCoins(list))
      .catch(() => undefined);
  }, [navigate]);

  const rpcUrl = primaryRpc || network.rpcEndpoints[0];

  const loadBalance = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const raw = await provider.getBalance(session.walletAddress);
      const decimals = coins.find((c) => c.symbol === "GYDS")?.decimals ?? 18;
      setBalance(formatUnits(raw, decimals));
    } catch {
      setBalance(null);
      toast.error("Could not read your balance", { description: `No answer from ${rpcUrl}` });
    } finally {
      setLoading(false);
    }
  }, [session, rpcUrl, coins]);

  useEffect(() => {
    if (session) loadBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session) return null;

  const gyds = coins.find((c) => c.symbol === "GYDS");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {session.role === "admin" ? "Admin" : "My"} Dashboard
          </h1>
          <p className="text-sm text-muted-foreground font-mono break-all">{session.walletAddress}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              navigator.clipboard.writeText(session.walletAddress);
              toast.success("Address copied");
            }}
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={loadBalance} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearSession();
              navigate("/");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-2">
            <Coins className="w-3.5 h-3.5" /> {gyds?.symbol ?? "GYDS"} balance
          </div>
          <p className="text-2xl font-mono text-primary">
            {balance === null ? "—" : `${Number(balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} GYDS`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Network: {network.name}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1">
            <Wallet className="w-3.5 h-3.5" /> Quick actions
          </div>
          <Link to="/wallet" className="flex items-center justify-between text-sm py-1.5 hover:text-primary">
            Send &amp; receive coins <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link to={`/address/${session.walletAddress}`} className="flex items-center justify-between text-sm py-1.5 hover:text-primary">
            My transactions <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link to="/about-coins" className="flex items-center justify-between text-sm py-1.5 hover:text-primary">
            About GYDS &amp; GYD <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          {session.role === "admin" && (
            <Link to="/admin" className="flex items-center justify-between text-sm py-1.5 text-primary">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Admin controls
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
