import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, parseEther, parseUnits } from "ethers";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Copy, Loader2, RefreshCw, Send, Wallet, X } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNetwork } from "@/contexts/NetworkContext";
import { fetchCoinSettings, fetchNetworkNodes, type CoinSetting, type NetworkNode } from "@/lib/networkApi";
import { fetchTokenBalances, type TokenBalance } from "@/lib/useTokenDeploy";
import { GYD_TOKEN, getEthereumProvider, getWalletError } from "@/lib/wallet";
import { toast } from "sonner";

const ERC20_TRANSFER_ABI = ["function transfer(address to, uint256 amount) returns (bool)"];
const DEFAULT_COINS: CoinSetting[] = [
  { symbol: "GYDS", name: "GYDSChain", decimals: 9, logoUrl: "/assets/gyds-logo.svg", description: "" },
  { symbol: "GYD", name: "GYD", decimals: 6, logoUrl: "/assets/gyd-logo.svg", description: "" },
];

interface NetworkBalance {
  node: NetworkNode;
  native: bigint | null;
  tokens: TokenBalance[];
  error?: string;
}

interface RegisteredToken {
  address: string;
  name: string;
  symbol?: string;
  decimals?: number;
}

function shortAddress(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

function formatBalance(raw: bigint, decimals: number, maxFraction = 6) {
  const value = formatUnits(raw, decimals);
  const [whole, fraction] = value.split(".");
  const trimmed = fraction?.slice(0, maxFraction).replace(/0+$/, "");
  return trimmed ? `${Number(whole).toLocaleString()}.${trimmed}` : Number(whole).toLocaleString();
}

function qrUrl(address: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(address)}`;
}

export default function MyWallet() {
  const { primaryRpc } = useNetwork();
  const [address, setAddress] = useState("");
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [coins, setCoins] = useState<CoinSetting[]>(DEFAULT_COINS);
  const [balances, setBalances] = useState<NetworkBalance[]>([]);
  const [registeredTokens, setRegisteredTokens] = useState<RegisteredToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [sendAsset, setSendAsset] = useState<"GYDS" | "GYD">("GYDS");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);

  const rpcFallback = primaryRpc || import.meta.env.VITE_RPC_URL || "https://rpc.netlifegy.com";
  const fallbackNode = useMemo<NetworkNode>(() => ({
    id: 0,
    name: "Current RPC",
    type: "full",
    rpcUrl: rpcFallback,
    enode: null,
    status: "configured",
    isActive: true,
  }), [rpcFallback]);

  const loadConfiguration = useCallback(async () => {
    const [nodeResult, coinResult] = await Promise.allSettled([fetchNetworkNodes(), fetchCoinSettings()]);
    const configuredNodes = nodeResult.status === "fulfilled" ? nodeResult.value.filter((node) => node.isActive && node.rpcUrl) : [];
    setNodes(configuredNodes.length ? configuredNodes : [fallbackNode]);
    if (coinResult.status === "fulfilled" && coinResult.value.length) setCoins(coinResult.value);
    try {
      const raw = JSON.parse(localStorage.getItem("gyds_deployed_tokens") || "[]") as RegisteredToken[];
      setRegisteredTokens(raw.filter((token) => /^0x[a-fA-F0-9]{40}$/.test(token.address)));
    } catch {
      setRegisteredTokens([]);
    }
  }, [fallbackNode]);

  useEffect(() => {
    loadConfiguration();
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    ethereum.request({ method: "eth_accounts" }).then((accounts) => {
      const first = Array.isArray(accounts) ? accounts[0] : "";
      if (typeof first === "string" && /^0x[a-fA-F0-9]{40}$/.test(first)) setAddress(first);
    }).catch(() => undefined);
  }, [loadConfiguration]);

  const connect = async () => {
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      toast.error("No compatible wallet detected", { description: "Install a browser wallet such as MetaMask to connect." });
      return;
    }
    setConnecting(true);
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const nextAddress = Array.isArray(accounts) ? accounts[0] : "";
      if (typeof nextAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(nextAddress)) throw new Error("The wallet did not return a valid address.");
      setAddress(nextAddress);
      toast.success("Wallet connected", { description: shortAddress(nextAddress) });
    } catch (walletError) {
      toast.error(getWalletError(walletError));
    } finally {
      setConnecting(false);
    }
  };

  const loadBalances = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError("");
    const activeNodes = nodes.length ? nodes : [fallbackNode];
    const tokenAddresses = [
      ...(GYD_TOKEN.address ? [GYD_TOKEN.address] : []),
      ...registeredTokens.map((token) => token.address),
    ].filter((token, index, all) => all.indexOf(token) === index);
    const nextBalances = await Promise.all(activeNodes.map(async (node): Promise<NetworkBalance> => {
      try {
        const provider = new JsonRpcProvider(node.rpcUrl);
        const [native, tokens] = await Promise.all([
          provider.getBalance(address),
          tokenAddresses.length ? fetchTokenBalances(address, tokenAddresses, node.rpcUrl) : Promise.resolve([]),
        ]);
        return { node, native, tokens };
      } catch (balanceError) {
        return { node, native: null, tokens: [], error: balanceError instanceof Error ? balanceError.message.slice(0, 120) : "Unable to reach RPC" };
      }
    }));
    setBalances(nextBalances);
    if (nextBalances.every((result) => result.error)) setError("None of the configured RPC nodes could be reached.");
    setLoading(false);
  }, [address, fallbackNode, nodes, registeredTokens]);

  useEffect(() => {
    if (address) loadBalances();
  }, [address, loadBalances]);

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(sendTo)) {
      toast.error("Enter a valid recipient address");
      return;
    }
    if (!sendAmount || Number(sendAmount) <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    const ethereum = getEthereumProvider();
    if (!ethereum) {
      toast.error("Connect a compatible browser wallet first");
      return;
    }
    setSending(true);
    try {
      const walletProvider = new BrowserProvider(ethereum);
      const signer = await walletProvider.getSigner();
      let tx;
      if (sendAsset === "GYDS") {
        tx = await signer.sendTransaction({ to: sendTo, value: parseEther(sendAmount) });
      } else {
        if (!GYD_TOKEN.address) throw new Error("The GYD contract address has not been configured.");
        const contract = new Contract(GYD_TOKEN.address, ERC20_TRANSFER_ABI, signer);
        tx = await contract.transfer(sendTo, parseUnits(sendAmount, GYD_TOKEN.decimals));
      }
      toast.success("Transaction submitted", { description: tx.hash });
      setSendTo("");
      setSendAmount("");
      setShowSend(false);
      await tx.wait();
      toast.success("Transaction confirmed");
      loadBalances();
    } catch (sendError) {
      toast.error(getWalletError(sendError));
    } finally {
      setSending(false);
    }
  };

  const nativeCoin = coins.find((coin) => coin.symbol.toUpperCase() === "GYDS") || DEFAULT_COINS[0];
  const stableCoin = coins.find((coin) => coin.symbol.toUpperCase() === "GYD") || DEFAULT_COINS[1];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-5">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Wallet className="w-6 h-6 text-primary" /></div>
              <div>
                <h1 className="text-3xl font-bold">My Wallet</h1>
                <p className="text-sm text-muted-foreground mt-1">View and send assets across your configured GYDS networks.</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {address && <Button variant="outline" size="sm" onClick={() => setShowReceive(true)} className="gap-1.5"><ArrowDownToLine className="w-4 h-4" /> Receive</Button>}
            {address && <Button size="sm" onClick={() => setShowSend(true)} className="gap-1.5"><ArrowUpFromLine className="w-4 h-4" /> Send</Button>}
            <Button onClick={connect} disabled={connecting} className="gap-1.5">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {address ? shortAddress(address) : "Connect wallet"}
            </Button>
          </div>
        </div>

        {address && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="font-mono text-sm break-all">{address}</span>
            <Button variant="ghost" size="sm" onClick={() => copy(address, "Wallet address")} className="gap-1.5"><Copy className="w-3.5 h-3.5" /> Copy</Button>
          </div>
        )}

        {!address ? (
          <div className="rounded-2xl border border-border bg-card py-20 text-center">
            <Wallet className="mx-auto h-12 w-12 text-primary/50" />
            <h2 className="mt-4 text-xl font-semibold">Connect your wallet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Connect a compatible browser wallet to see GYDS, GYD, and registered ERC-20 balances across active network nodes.</p>
            <Button onClick={connect} disabled={connecting} className="mt-6 gap-2">{connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Connect wallet</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Balances</h2>
                <p className="text-xs text-muted-foreground">{balances.length} active network node{balances.length === 1 ? "" : "s"} configured</p>
              </div>
              <Button variant="ghost" size="sm" onClick={loadBalances} disabled={loading} className="gap-1.5"><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
            </div>
            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-5">
              {balances.map(({ node, native, tokens, error: nodeError }) => {
                const gydToken = tokens.find((token) => token.contractAddress.toLowerCase() === GYD_TOKEN.address.toLowerCase());
                return (
                  <section key={node.id || node.rpcUrl} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/30 px-5 py-3">
                      <div><h3 className="text-sm font-semibold">{node.name}</h3><p className="text-xs text-muted-foreground font-mono">{node.rpcUrl}</p></div>
                      <span className={`rounded-full px-2 py-1 text-[11px] ${nodeError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{nodeError ? "Offline" : node.type}</span>
                    </div>
                    {nodeError ? <p className="px-5 py-8 text-sm text-destructive">{nodeError}</p> : (
                      <div className="grid gap-3 p-4 md:grid-cols-2">
                        <BalanceCard symbol={nativeCoin.symbol} name={nativeCoin.name} logoUrl={nativeCoin.logoUrl} value={native === null ? "—" : formatBalance(native, 18)} decimals={nativeCoin.decimals} />
                        <BalanceCard symbol={stableCoin.symbol} name={stableCoin.name} logoUrl={stableCoin.logoUrl} value={gydToken ? formatBalance(gydToken.balance, gydToken.decimals) : "Not configured"} decimals={stableCoin.decimals} />
                        {tokens.filter((token) => token.contractAddress.toLowerCase() !== GYD_TOKEN.address.toLowerCase()).map((token) => (
                          <BalanceCard key={token.contractAddress} symbol={token.symbol} name={token.name} value={formatBalance(token.balance, token.decimals)} decimals={token.decimals} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Balance reads use each active node’s public RPC. Transactions are always submitted through the wallet you approve.</p>
          </>
        )}
      </motion.div>

      {showReceive && address && (
        <Modal title="Receive assets" onClose={() => setShowReceive(false)}>
          <div className="flex flex-col items-center gap-4">
            <img src={qrUrl(address)} alt="QR code for wallet address" className="h-52 w-52 rounded-xl border border-border bg-white p-2" />
            <p className="text-center text-xs text-muted-foreground">Scan this address with a compatible wallet.</p>
            <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3"><span className="min-w-0 flex-1 break-all font-mono text-xs">{address}</span><Button variant="ghost" size="sm" onClick={() => copy(address, "Wallet address")}><Copy className="h-4 w-4" /></Button></div>
          </div>
        </Modal>
      )}

      {showSend && (
        <Modal title="Send assets" onClose={() => setShowSend(false)}>
          <form onSubmit={send} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(["GYDS", "GYD"] as const).map((asset) => <button type="button" key={asset} onClick={() => setSendAsset(asset)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${sendAsset === asset ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{asset}</button>)}
            </div>
            <div><label className="mb-1.5 block text-xs text-muted-foreground">Recipient address</label><Input value={sendTo} onChange={(event) => setSendTo(event.target.value)} placeholder="0x..." className="font-mono text-xs" /></div>
            <div><label className="mb-1.5 block text-xs text-muted-foreground">Amount ({sendAsset})</label><Input type="number" min="0" step="any" value={sendAmount} onChange={(event) => setSendAmount(event.target.value)} placeholder="0.00" /></div>
            <p className="text-xs text-muted-foreground">Review the recipient and network in your wallet before approving. This action cannot be undone.</p>
            <Button type="submit" disabled={sending} className="w-full gap-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sending ? "Sending…" : `Send ${sendAsset}`}</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function BalanceCard({ symbol, name, logoUrl, value, decimals }: { symbol: string; name: string; logoUrl?: string | null; value: string; decimals: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">
      {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 rounded-full bg-secondary object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{symbol.slice(0, 2)}</div>}
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{name} <span className="text-xs text-muted-foreground">({symbol})</span></p><p className="text-xs text-muted-foreground">{decimals} decimals</p></div>
      <p className="text-right font-mono text-sm font-semibold">{value} <span className="text-xs text-muted-foreground">{symbol}</span></p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        {children}
      </div>
    </div>
  );
}