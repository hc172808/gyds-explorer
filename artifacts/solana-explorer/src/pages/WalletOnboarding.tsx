import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, KeyRound, Smartphone, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useNetwork } from "@/contexts/NetworkContext";
import {
  GYD_TOKEN,
  GYDS_NETWORK,
  addGydsNetwork,
  addGydToken,
  getRpcUrls,
  getWalletError,
  isGydConfigured,
} from "@/lib/wallet";

const WalletOnboarding = () => {
  const { primaryRpc, secondaryRpc } = useNetwork();
  const [busy, setBusy] = useState<"network" | "token" | null>(null);
  const [networkAdded, setNetworkAdded] = useState(false);
  const [tokenAdded, setTokenAdded] = useState(false);

  const rpcUrls = useMemo(() => getRpcUrls(primaryRpc, secondaryRpc), [primaryRpc, secondaryRpc]);
  const manualDetails = [
    ["Network name", GYDS_NETWORK.chainName],
    ["Chain ID", `${GYDS_NETWORK.chainId} (${Number.parseInt(GYDS_NETWORK.chainId, 16)})`],
    ["RPC URL", rpcUrls[0] || "Configure a production RPC in Admin → Node"],
    ["Currency", `${GYDS_NETWORK.nativeCurrency.name} (${GYDS_NETWORK.nativeCurrency.symbol})`],
    ["Decimals", String(GYDS_NETWORK.nativeCurrency.decimals)],
    ["Block explorer", GYDS_NETWORK.blockExplorerUrl],
  ];

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const handleNetwork = async () => {
    setBusy("network");
    try {
      await addGydsNetwork(rpcUrls);
      setNetworkAdded(true);
      toast.success("GYDSChain added to your wallet");
    } catch (error) {
      toast.error(getWalletError(error));
    } finally {
      setBusy(null);
    }
  };

  const handleToken = async () => {
    setBusy("token");
    try {
      await addGydToken();
      setTokenAdded(true);
      toast.success("GYD added to your wallet");
    } catch (error) {
      toast.error(getWalletError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <img src="/assets/gyds-logo.svg" alt="GYDSChain" className="h-12 w-12 rounded-2xl" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Wallet setup</p>
            <h1 className="text-3xl font-bold">Add GYDSChain to your wallet</h1>
          </div>
        </div>
        <p className="text-muted-foreground">
          Add the network first, then import GYD as a separate token. Your wallet
          will always ask you to approve each metadata request.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="bg-card border border-border rounded-2xl p-6 glow-card">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs text-primary font-mono mb-2">STEP 01</p>
              <h2 className="text-xl font-semibold">Add the network</h2>
              <p className="text-sm text-muted-foreground mt-1">Native coin: GYDS</p>
            </div>
            <img src="/assets/gyds-logo.svg" alt="" className="h-11 w-11 rounded-xl" />
          </div>
          <Button onClick={handleNetwork} disabled={busy !== null} className="w-full gap-2">
            {networkAdded ? <CheckCircle2 className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
            {busy === "network" ? "Waiting for wallet…" : networkAdded ? "Network added" : "Add GYDSChain"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground flex gap-2">
            <Smartphone className="h-4 w-4 shrink-0" />
            Works with compatible browser wallets. Mobile wallets may need their
            in-app browser or the manual details below.
          </p>
        </section>

        <section className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs text-accent font-mono mb-2">STEP 02</p>
              <h2 className="text-xl font-semibold">Import GYD</h2>
              <p className="text-sm text-muted-foreground mt-1">ERC-20 token on GYDSChain</p>
            </div>
            <img src="/assets/gyd-logo.svg" alt="" className="h-11 w-11 rounded-xl" />
          </div>
          <Button onClick={handleToken} disabled={busy !== null || !isGydConfigured()} variant="outline" className="w-full gap-2">
            {tokenAdded ? <CheckCircle2 className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            {busy === "token" ? "Waiting for wallet…" : tokenAdded ? "Token added" : "Add GYD token"}
          </Button>
          {!isGydConfigured() && (
            <p className="mt-3 text-xs text-amber-300 flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              The verified GYD contract address will enable this button after deployment.
            </p>
          )}
          {isGydConfigured() && (
            <button onClick={() => copy(GYD_TOKEN.address, "GYD contract address")} className="mt-3 text-xs text-primary hover:underline font-mono truncate max-w-full">
              {GYD_TOKEN.address}
            </button>
          )}
        </section>
      </div>

      <section className="mt-5 bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Manual setup</h2>
            <p className="text-sm text-muted-foreground">Use these details when one-click setup is unavailable.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => copy(manualDetails.map(([key, value]) => `${key}: ${value}`).join("\n"), "network details")} className="gap-2">
            <Copy className="h-4 w-4" /> Copy details
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {manualDetails.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-secondary/50 border border-border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{key}</p>
              <p className="mt-1 text-xs font-mono break-all">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Important safety check</p>
          Confirm the chain ID is <span className="font-mono text-foreground">198282</span> and the RPC uses the official HTTPS domain before saving. Adding a network or token never sends funds.
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <Link to="/terms" className="hover:text-foreground hover:underline">Read terms</Link>
        <Link to="/admin" className="hover:text-foreground hover:underline">Admin network settings</Link>
        <a href={GYDS_NETWORK.blockExplorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
          Open explorer <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};

export default WalletOnboarding;