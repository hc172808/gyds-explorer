import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Coins, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { fetchCoinSettings, type CoinSetting } from "@/lib/networkApi";
import { GYDS_COIN, GYD_COIN } from "@/lib/coins";
import { Button } from "@/components/ui/button";

const FALLBACK_COINS: CoinSetting[] = [
  {
    symbol: GYDS_COIN.symbol,
    name: GYDS_COIN.name,
    decimals: GYDS_COIN.decimals,
    logoUrl: import.meta.env.VITE_NATIVE_COIN_LOGO_URL || "/assets/gyds-logo.svg",
    description: GYDS_COIN.description,
  },
  {
    symbol: GYD_COIN.symbol,
    name: GYD_COIN.name,
    decimals: GYD_COIN.decimals,
    logoUrl: import.meta.env.VITE_GYD_LOGO_URL || "/assets/gyd-logo.svg",
    description: GYD_COIN.description,
  },
];

export default function AboutCoins() {
  const [coins, setCoins] = useState<CoinSetting[]>(FALLBACK_COINS);
  const [loading, setLoading] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);

  const loadCoins = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await fetchCoinSettings();
      if (settings.length) {
        setCoins(settings);
        setApiAvailable(true);
      }
    } catch {
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoins();
  }, [loadCoins]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-5">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Coins className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">About the coins</h1>
                <p className="text-sm text-muted-foreground mt-1">The native GYDS coin and the GYD stablecoin on GYDSChain.</p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={loadCoins} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {!apiAvailable && (
          <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
            Showing the built-in coin information. Admin-published descriptions will appear here when the API is connected.
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {coins.map((coin) => (
            <article key={coin.symbol} className="rounded-2xl border border-border bg-card p-6 glow-card">
              <div className="flex items-start gap-4">
                <img src={coin.logoUrl || "/assets/gyds-logo.svg"} alt="" className="h-14 w-14 rounded-2xl border border-border bg-secondary object-cover" />
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary">{coin.symbol}</p>
                  <h2 className="mt-1 text-2xl font-semibold">{coin.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{coin.decimals} decimal places</p>
                </div>
              </div>
              <p className="mt-6 text-sm leading-7 text-muted-foreground">{coin.description || "No description has been published yet."}</p>
            </article>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading published settings…
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link to="/wallet" className="hover:text-primary hover:underline">Open wallet</Link>
          <Link to="/tokens" className="hover:text-primary hover:underline">Look up balances</Link>
        </div>
      </motion.div>
    </div>
  );
}