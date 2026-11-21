import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, ContractFactory, JsonRpcProvider, formatUnits, isAddress, parseUnits } from "ethers";
import { AlertTriangle, ArrowDownUp, Coins, Droplets, Loader2, Plus, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNetwork } from "@/contexts/NetworkContext";
import { proxyRpcUrl } from "@/lib/networkApi";
import {
  addTokenToWallet,
  getEthereumProvider,
  getEthereumProviderForAccount,
  getRpcUrls,
  getWalletError,
  switchToGydsNetwork,
  type WalletTokenAsset,
} from "@/lib/wallet";
import { getStoredSession, isPrivilegedSession } from "@/lib/session";
import DEX_ARTIFACT from "@/lib/gyds-dex-testnet-artifact.json";
import { toast } from "sonner";

const DEX_ADDRESS_KEY = "gyds_testnet_dex_address";
const DEX_TOKENS_KEY = "gyds_testnet_tokens";
const TESTNET_CHAIN_ID = 198281n;
const TESTNET_RPC = proxyRpcUrl(undefined, "testnet");
const WRAPPED_GYDS_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function deposit() payable",
  "function withdraw(uint256)",
];
const TOKEN_METADATA_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

interface DexToken extends WalletTokenAsset {
  name: string;
  isWrappedNative?: boolean;
}

interface PoolSnapshot {
  exists: boolean;
  reserveA: bigint;
  reserveB: bigint;
  totalShares: bigint;
  userShares: bigint;
}

const NATIVE_GYDS: DexToken = {
  address: "NATIVE",
  name: "Native GYDS",
  symbol: "GYDS",
  decimals: 18,
};

function readSavedTokens(): DexToken[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEX_TOKENS_KEY) || "[]") as DexToken[];
    return parsed.filter((token) =>
      isAddress(token.address) &&
      typeof token.symbol === "string" &&
      token.symbol.trim().length > 0 &&
      Number.isInteger(token.decimals) &&
      token.decimals >= 0 &&
      token.decimals <= 18,
    );
  } catch {
    return [];
  }
}

function displayAmount(raw: bigint, decimals: number) {
  const [whole, fraction = ""] = formatUnits(raw, decimals).split(".");
  const trimmed = fraction.slice(0, 6).replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString()}${trimmed ? `.${trimmed}` : ""}`;
}

function errorText(error: unknown) {
  return getWalletError(error);
}

export default function Swap() {
  const { networkType } = useNetwork();
  const [account, setAccount] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [dexAddress, setDexAddress] = useState("");
  const [dexAddressInput, setDexAddressInput] = useState(() => localStorage.getItem(DEX_ADDRESS_KEY) || "");
  const [dexReady, setDexReady] = useState(false);
  const [dexLoading, setDexLoading] = useState(false);
  const [dexError, setDexError] = useState("");
  const [wrappedNative, setWrappedNative] = useState("");
  const [tokens, setTokens] = useState<DexToken[]>(readSavedTokens);
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [addingToken, setAddingToken] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [fromAddress, setFromAddress] = useState("NATIVE");
  const [toAddress, setToAddress] = useState("");
  const [swapAmount, setSwapAmount] = useState("");
  const [quote, setQuote] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [tokenAAddress, setTokenAAddress] = useState("");
  const [tokenBAddress, setTokenBAddress] = useState("");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [addingLiquidity, setAddingLiquidity] = useState(false);
  const [removePercent, setRemovePercent] = useState("25");
  const [removingLiquidity, setRemovingLiquidity] = useState(false);
  const [poolSnapshot, setPoolSnapshot] = useState<PoolSnapshot | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [wrappingAmount, setWrappingAmount] = useState("");
  const [wrapping, setWrapping] = useState(false);
  const [walletImporting, setWalletImporting] = useState("");

  const tokenChoices = useMemo(() => [NATIVE_GYDS, ...tokens], [tokens]);
  const erc20Choices = tokens;
  const fromToken = tokenChoices.find((token) => token.address === fromAddress) || null;
  const toToken = tokenChoices.find((token) => token.address === toAddress) || null;
  const tokenA = erc20Choices.find((token) => token.address === tokenAAddress) || null;
  const tokenB = erc20Choices.find((token) => token.address === tokenBAddress) || null;
  const deploySession = getStoredSession();
  const isAdmin = Boolean(deploySession && isPrivilegedSession(deploySession));

  useEffect(() => {
    localStorage.setItem(DEX_TOKENS_KEY, JSON.stringify(tokens));
  }, [tokens]);

  const getSigner = useCallback(async () => {
    if (!account) throw new Error("Connect your wallet first.");
    const provider = await getEthereumProviderForAccount(account);
    if (!provider) throw new Error("Unlock the wallet connected to this page.");
    await switchToGydsNetwork(provider, getRpcUrls(TESTNET_RPC), "testnet");
    const browserProvider = new BrowserProvider(provider);
    const signer = await browserProvider.getSigner();
    const signerAddress = await signer.getAddress();
    if (signerAddress.toLowerCase() !== account.toLowerCase()) {
      throw new Error("The active wallet account changed. Reconnect the intended account.");
    }
    if ((await browserProvider.getNetwork()).chainId !== TESTNET_CHAIN_ID) {
      throw new Error("Switch to GYDS Testnet (chain ID 198281).");
    }
    return signer;
  }, [account]);

  const loadDex = useCallback(async (address: string) => {
    setDexLoading(true);
    setDexReady(false);
    setDexError("");
    try {
      if (!isAddress(address)) throw new Error("Enter a valid DEX contract address.");
      const provider = new JsonRpcProvider(TESTNET_RPC);
      const network = await provider.getNetwork();
      if (network.chainId !== TESTNET_CHAIN_ID) throw new Error("The selected RPC is not GYDS Testnet.");
      const dex = new Contract(address, DEX_ARTIFACT.abi, provider);
      const [chainId, wrappedAddress] = await Promise.all([
        dex.TESTNET_CHAIN_ID(),
        dex.wrappedNative(),
      ]);
      if (BigInt(chainId) !== TESTNET_CHAIN_ID || !isAddress(String(wrappedAddress))) {
        throw new Error("This is not a supported testnet DEX contract.");
      }

      setDexAddress(address);
      setDexAddressInput(address);
      setWrappedNative(String(wrappedAddress));
      localStorage.setItem(DEX_ADDRESS_KEY, address);
      setTokens((previous) => {
        const withoutOldWrapped = previous.filter((token) => !token.isWrappedNative);
        return [{
          address: String(wrappedAddress),
          name: "Wrapped GYDS",
          symbol: "WGYDS",
          decimals: 18,
          isWrappedNative: true,
        }, ...withoutOldWrapped.filter((token) => token.address.toLowerCase() !== String(wrappedAddress).toLowerCase())];
      });
      setDexReady(true);
    } catch (error) {
      setDexError(error instanceof Error ? error.message : "Could not load the testnet DEX.");
    } finally {
      setDexLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedAddress = localStorage.getItem(DEX_ADDRESS_KEY);
    if (savedAddress) void loadDex(savedAddress);
  }, [loadDex]);

  useEffect(() => {
    if (!tokenAAddress && erc20Choices.length > 0) setTokenAAddress(erc20Choices[0].address);
    if (!tokenBAddress && erc20Choices.length > 1) setTokenBAddress(erc20Choices[1].address);
    if (!toAddress && tokens.length > 0) setToAddress(tokens[0].address);
  }, [erc20Choices, tokenAAddress, tokenBAddress, toAddress, tokens]);

  const connectWallet = async () => {
    const provider = getEthereumProvider();
    if (!provider) {
      toast.error("No compatible Web3 wallet found", { description: "Install MetaMask, Trust Wallet, Phantom EVM, or another injected EVM wallet." });
      return;
    }
    setConnecting(true);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const first = Array.isArray(accounts) ? accounts[0] : "";
      if (typeof first !== "string" || !isAddress(first)) throw new Error("The wallet did not return a valid EVM address.");
      await switchToGydsNetwork(provider, getRpcUrls(TESTNET_RPC), "testnet");
      setAccount(first);
      toast.success("Wallet connected to GYDS Testnet");
    } catch (error) {
      toast.error("Could not connect wallet", { description: errorText(error) });
    } finally {
      setConnecting(false);
    }
  };

  const deployDex = async () => {
    const session = getStoredSession();
    if (!session || !isPrivilegedSession(session)) {
      toast.error("An authorized admin wallet must deploy the shared testnet DEX.");
      return;
    }
    if (!window.confirm("Deploy the unaudited GYDS DEX prototype to GYDS Testnet only? The contract rejects other chain IDs and this deployment cannot be edited later.")) {
      return;
    }
    setDeploying(true);
    setTxHash("");
    try {
      if (!account) throw new Error("Connect the admin wallet first.");
      if (account.toLowerCase() !== session.walletAddress.toLowerCase()) {
        throw new Error("Connect the wallet used for this admin session.");
      }
      const signer = await getSigner();
      const factory = new ContractFactory(DEX_ARTIFACT.abi, DEX_ARTIFACT.bytecode, signer);
      const deployed = await factory.deploy();
      const deploymentTx = deployed.deploymentTransaction();
      if (deploymentTx?.hash) setTxHash(deploymentTx.hash);
      await deployed.waitForDeployment();
      const deployedAddress = await deployed.getAddress();
      await loadDex(deployedAddress);
      toast.success("Testnet DEX deployed", { description: deployedAddress });
    } catch (error) {
      toast.error("DEX deployment failed", { description: errorText(error) });
    } finally {
      setDeploying(false);
    }
  };

  const saveDexAddress = async () => {
    await loadDex(dexAddressInput.trim());
  };

  const addTestnetToken = async () => {
    if (!isAddress(newTokenAddress.trim())) {
      toast.error("Enter a valid ERC-20 contract address.");
      return;
    }
    setAddingToken(true);
    try {
      const provider = new JsonRpcProvider(TESTNET_RPC);
      if ((await provider.getNetwork()).chainId !== TESTNET_CHAIN_ID) throw new Error("The token lookup RPC is not GYDS Testnet.");
      if ((await provider.getCode(newTokenAddress.trim())) === "0x") throw new Error("No contract is deployed at this address on GYDS Testnet.");
      const contract = new Contract(newTokenAddress.trim(), TOKEN_METADATA_ABI, provider);
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ]);
      const token: DexToken = {
        address: newTokenAddress.trim(),
        name: String(name),
        symbol: String(symbol),
        decimals: Number(decimals),
      };
      if (!token.symbol.trim() || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 18) {
        throw new Error("The token must have a symbol and use 0–18 decimals.");
      }
      if (tokens.some((current) => current.address.toLowerCase() === token.address.toLowerCase())) {
        toast.info("This token is already in your testnet list.");
        return;
      }
      setTokens((current) => [token, ...current]);
      setNewTokenAddress("");
      toast.success(`${token.symbol} added to your testnet token list`);
    } catch (error) {
      toast.error("Could not add testnet token", { description: errorText(error) });
    } finally {
      setAddingToken(false);
    }
  };

  const importTestnetToken = async (token: DexToken) => {
    setWalletImporting(token.address);
    try {
      const provider = await getEthereumProviderForAccount(account);
      if (!provider) throw new Error("Unlock the wallet connected to this page.");
      await switchToGydsNetwork(provider, getRpcUrls(TESTNET_RPC), "testnet");
      await addTokenToWallet(token, provider);
      toast.success(`${token.symbol} added to your wallet`);
    } catch (error) {
      toast.error("Could not add token to wallet", { description: errorText(error) });
    } finally {
      setWalletImporting("");
    }
  };

  const quoteSwap = useCallback(async () => {
    setQuote("");
    setQuoteError("");
    if (!dexReady || !dexAddress || !wrappedNative || !fromToken || !toToken || !swapAmount.trim()) {
      setQuoteLoading(false);
      return;
    }
    setQuoteLoading(true);
    try {
      const amountIn = parseUnits(swapAmount.trim(), fromToken.decimals);
      if (amountIn <= 0n) return;
      const input = fromToken.address === "NATIVE" ? wrappedNative : fromToken.address;
      const output = toToken.address === "NATIVE" ? wrappedNative : toToken.address;
      if (input.toLowerCase() === output.toLowerCase()) throw new Error("Choose two different assets.");
      const dex = new Contract(dexAddress, DEX_ARTIFACT.abi, new JsonRpcProvider(TESTNET_RPC));
      const amounts = await dex.getAmountsOut(amountIn, [input, output]);
      setQuote(displayAmount(BigInt(amounts[1]), toToken.decimals));
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : "No direct pool or quote available.");
    } finally {
      setQuoteLoading(false);
    }
  }, [dexAddress, dexReady, fromToken, swapAmount, toToken, wrappedNative]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void quoteSwap(), 350);
    return () => window.clearTimeout(timeout);
  }, [quoteSwap]);

  const approveToken = async (tokenAddress: string, amount: bigint, signer: Awaited<ReturnType<typeof getSigner>>) => {
    const token = new Contract(tokenAddress, TOKEN_METADATA_ABI, signer);
    const allowance = BigInt(await token.allowance(account, dexAddress));
    if (allowance < amount) {
      const approveTx = await token.approve(dexAddress, amount);
      toast.info("Approve token use in your wallet", { description: approveTx.hash });
      await approveTx.wait();
    }
  };

  const swap = async () => {
    if (!dexReady || !dexAddress || !fromToken || !toToken || !account) {
      toast.error("Configure the DEX and connect your wallet first.");
      return;
    }
    let amountIn: bigint;
    try {
      amountIn = parseUnits(swapAmount.trim(), fromToken.decimals);
    } catch {
      toast.error(`Enter a valid ${fromToken.symbol} amount.`);
      return;
    }
    if (amountIn <= 0n) {
      toast.error("Swap amount must be greater than zero.");
      return;
    }

    setSwapping(true);
    setTxHash("");
    try {
      const signer = await getSigner();
      const dex = new Contract(dexAddress, DEX_ARTIFACT.abi, signer);
      const input = fromToken.address === "NATIVE" ? wrappedNative : fromToken.address;
      const output = toToken.address === "NATIVE" ? wrappedNative : toToken.address;
      if (input.toLowerCase() === output.toLowerCase()) throw new Error("Choose two different assets.");
      const path = [input, output];
      const quoted = await dex.getAmountsOut(amountIn, path);
      const amountOut = BigInt(quoted[1]);
      const minAmountOut = amountOut * 9950n / 10000n;
      const readableQuote = displayAmount(amountOut, toToken.decimals);
      if (!window.confirm(`Swap ${displayAmount(amountIn, fromToken.decimals)} ${fromToken.symbol} for about ${readableQuote} ${toToken.symbol}? Minimum after 0.5% slippage: ${displayAmount(minAmountOut, toToken.decimals)} ${toToken.symbol}. Testnet prototype only.`)) return;

      let tx;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      if (fromToken.address === "NATIVE") {
        tx = await dex.swapExactNativeForTokens(minAmountOut, path, account, deadline, { value: amountIn });
      } else if (toToken.address === "NATIVE") {
        await approveToken(fromToken.address, amountIn, signer);
        tx = await dex.swapExactTokensForNative(amountIn, minAmountOut, path, account, deadline);
      } else {
        await approveToken(fromToken.address, amountIn, signer);
        tx = await dex.swapExactTokensForTokens(amountIn, minAmountOut, path, account, deadline);
      }
      setTxHash(tx.hash);
      await tx.wait();
      toast.success("Testnet swap confirmed", { description: tx.hash });
      setSwapAmount("");
      setQuote("");
    } catch (error) {
      toast.error("Swap failed", { description: errorText(error) });
    } finally {
      setSwapping(false);
    }
  };

  const refreshPool = useCallback(async () => {
    if (!dexReady || !dexAddress || !tokenA || !tokenB) {
      setPoolSnapshot(null);
      return;
    }
    setPoolLoading(true);
    try {
      const dex = new Contract(dexAddress, DEX_ARTIFACT.abi, new JsonRpcProvider(TESTNET_RPC));
      const [pool, userShares] = await Promise.all([
        dex.getPool(tokenA.address, tokenB.address),
        account ? dex.getShares(tokenA.address, tokenB.address, account) : Promise.resolve(0n),
      ]);
      setPoolSnapshot({
        exists: Boolean(pool[0]),
        reserveA: BigInt(pool[1]),
        reserveB: BigInt(pool[2]),
        totalShares: BigInt(pool[3]),
        userShares: BigInt(userShares),
      });
    } catch {
      setPoolSnapshot(null);
    } finally {
      setPoolLoading(false);
    }
  }, [account, dexAddress, dexReady, tokenA, tokenB]);

  useEffect(() => { void refreshPool(); }, [refreshPool]);

  const addLiquidity = async () => {
    if (!dexReady || !dexAddress || !account || !tokenA || !tokenB) {
      toast.error("Configure the DEX, select two tokens, and connect your wallet.");
      return;
    }
    if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase()) {
      toast.error("Choose two different tokens.");
      return;
    }
    let desiredA: bigint;
    let desiredB: bigint;
    try {
      desiredA = parseUnits(amountA.trim(), tokenA.decimals);
      desiredB = parseUnits(amountB.trim(), tokenB.decimals);
    } catch {
      toast.error("Enter valid amounts for both tokens.");
      return;
    }
    if (desiredA <= 0n || desiredB <= 0n) {
      toast.error("Both liquidity amounts must be greater than zero.");
      return;
    }

    setAddingLiquidity(true);
    setTxHash("");
    try {
      if (!window.confirm(`Add up to ${amountA} ${tokenA.symbol} and ${amountB} ${tokenB.symbol} to this testnet pool? Existing pools may use only the ratio-matched portion.`)) return;
      const signer = await getSigner();
      await approveToken(tokenA.address, desiredA, signer);
      await approveToken(tokenB.address, desiredB, signer);
      const dex = new Contract(dexAddress, DEX_ARTIFACT.abi, signer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      const tx = await dex.addLiquidity(
        tokenA.address,
        tokenB.address,
        desiredA,
        desiredB,
        0,
        0,
        account,
        deadline,
      );
      setTxHash(tx.hash);
      await tx.wait();
      toast.success("Testnet liquidity added", { description: tx.hash });
      await refreshPool();
    } catch (error) {
      toast.error("Could not add liquidity", { description: errorText(error) });
    } finally {
      setAddingLiquidity(false);
    }
  };

  const removeLiquidity = async () => {
    if (!dexReady || !dexAddress || !account || !tokenA || !tokenB || !poolSnapshot?.exists) {
      toast.error("No pool is available for this token pair.");
      return;
    }
    const percent = Number(removePercent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      toast.error("Choose a removal amount from 1% to 100%.");
      return;
    }
    const shares = poolSnapshot.userShares * BigInt(percent) / 100n;
    if (shares <= 0n) {
      toast.error("You do not have enough LP shares for that percentage.");
      return;
    }
    const estimatedA = shares * poolSnapshot.reserveA / poolSnapshot.totalShares;
    const estimatedB = shares * poolSnapshot.reserveB / poolSnapshot.totalShares;
    if (!window.confirm(`Remove ${percent}% of your LP shares, receiving about ${displayAmount(estimatedA, tokenA.decimals)} ${tokenA.symbol} and ${displayAmount(estimatedB, tokenB.decimals)} ${tokenB.symbol}?`)) {
      return;
    }
    const amountAMin = shares * poolSnapshot.reserveA / poolSnapshot.totalShares * 9950n / 10000n;
    const amountBMin = shares * poolSnapshot.reserveB / poolSnapshot.totalShares * 9950n / 10000n;

    setRemovingLiquidity(true);
    setTxHash("");
    try {
      const signer = await getSigner();
      const dex = new Contract(dexAddress, DEX_ARTIFACT.abi, signer);
      const tx = await dex.removeLiquidity(
        tokenA.address,
        tokenB.address,
        shares,
        amountAMin,
        amountBMin,
        account,
        BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
      );
      setTxHash(tx.hash);
      await tx.wait();
      toast.success("Testnet liquidity removed", { description: tx.hash });
      await refreshPool();
    } catch (error) {
      toast.error("Could not remove liquidity", { description: errorText(error) });
    } finally {
      setRemovingLiquidity(false);
    }
  };

  const wrapNative = async (unwrap = false) => {
    if (!wrappedNative || !account) {
      toast.error("Connect your wallet and load the DEX first.");
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits(wrappingAmount.trim(), 18);
    } catch {
      toast.error("Enter a valid GYDS amount.");
      return;
    }
    if (amount <= 0n) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    setWrapping(true);
    setTxHash("");
    try {
      const signer = await getSigner();
      const wrapped = new Contract(wrappedNative, WRAPPED_GYDS_ABI, signer);
      const tx = unwrap ? await wrapped.withdraw(amount) : await wrapped.deposit({ value: amount });
      setTxHash(tx.hash);
      await tx.wait();
      toast.success(unwrap ? "WGYDS unwrapped to native GYDS" : "GYDS wrapped as WGYDS", { description: tx.hash });
      setWrappingAmount("");
    } catch (error) {
      toast.error("Could not wrap or unwrap GYDS", { description: errorText(error) });
    } finally {
      setWrapping(false);
    }
  };

  const tokenSelect = (value: string, onChange: (value: string) => void, choices: DexToken[]) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="">Select a token</option>
      {choices.map((token) => (
        <option key={token.address} value={token.address}>{token.name} ({token.symbol})</option>
      ))}
    </select>
  );

  return (
    <main className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">GYDS Testnet Swap</h1>
          <p className="mt-1 text-sm text-muted-foreground">Experimental constant-product exchange · chain 198281 only</p>
        </div>
        <Button onClick={connectWallet} disabled={connecting} className="gap-2">
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect wallet"}
        </Button>
      </header>

      <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="space-y-1">
          <p className="font-semibold">Testnet prototype only — not audited and not for real funds.</p>
          <p className="text-muted-foreground">
            This is a direct-pool AMM with a 0.3% swap fee. Pools need users to provide tokens and liquidity. A token showing “USDT” on testnet is not proof that it is official Tether. Transfer-tax and rebasing tokens are unsupported.
          </p>
        </div>
      </div>

      {networkType !== "testnet" && (
        <p className="rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
          The exchange always reads GYDS Testnet, regardless of the explorer’s network selector. Wallet transactions switch to testnet and the contract rejects other chains.
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Testnet DEX contract</h2>
          <p className="mt-1 text-xs text-muted-foreground">Deploy once as an admin, then share the address with testnet users. Verify the address before approving token use.</p>
          </div>
          {isAdmin && (
            <Button onClick={deployDex} disabled={deploying || !account} className="gap-2">
              {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {deploying ? "Deploying…" : "Deploy testnet DEX"}
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={dexAddressInput} onChange={(event) => setDexAddressInput(event.target.value)} placeholder="Paste shared GYDS testnet DEX address" className="font-mono text-xs" />
          <Button variant="outline" onClick={() => void saveDexAddress()} disabled={dexLoading} className="shrink-0 gap-2">
            {dexLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Load DEX
          </Button>
        </div>
        {dexAddress && dexReady && (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>DEX: <code className="break-all">{dexAddress}</code></p>
            <p>Wrapped native GYDS: <code className="break-all">{wrappedNative}</code></p>
          </div>
        )}
        {dexError && <p role="alert" className="mt-3 text-sm text-destructive">{dexError}</p>}
        {txHash && <p className="mt-3 break-all text-xs text-muted-foreground">Latest transaction: {txHash}</p>}
        {!isAdmin && (
          <p className="mt-3 text-xs text-muted-foreground">Only an authorized admin session can deploy the shared testnet DEX. Users can load its address above.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="font-semibold">Testnet tokens</h2>
          <p className="mt-1 text-xs text-muted-foreground">Add ERC-20 contract addresses deployed on GYDS Testnet. Mainnet token addresses are not used here.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={newTokenAddress} onChange={(event) => setNewTokenAddress(event.target.value)} placeholder="0x testnet ERC-20 contract address" className="font-mono text-xs" />
          <Button onClick={() => void addTestnetToken()} disabled={addingToken} className="shrink-0 gap-2">
            {addingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add token
          </Button>
        </div>
        {tokens.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {tokens.map((token) => (
              <div key={token.address} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/20 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{token.name} ({token.symbol})</p>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">{token.address}</p>
                  {token.symbol.toUpperCase() === "USDT" && <p className="mt-1 text-[11px] text-amber-600">Testnet USDT symbol only; not verified Tether.</p>}
                </div>
                {account && (
                  <Button variant="outline" size="sm" disabled={Boolean(walletImporting)} onClick={() => void importTestnetToken(token)} className="shrink-0 gap-1.5">
                    {walletImporting === token.address ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                    Add to wallet
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Load the DEX to add WGYDS, then add other testnet ERC-20 contract addresses.</p>
        )}
      </section>

      <section className="rounded-2xl border border-primary/30 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Swap</h2>
            <p className="text-xs text-muted-foreground">Direct pools only · 0.5% minimum-output slippage tolerance</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">You pay</label>
              <Input type="number" min="0" step="any" value={swapAmount} onChange={(event) => setSwapAmount(event.target.value)} placeholder="0.0" />
              {tokenSelect(fromAddress, setFromAddress, tokenChoices)}
            </div>
            <Button variant="outline" size="icon" aria-label="Switch swap direction" onClick={() => {
              setFromAddress(toAddress);
              setToAddress(fromAddress);
              setSwapAmount("");
            }}>
              <ArrowDownUp className="h-4 w-4" />
            </Button>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">You receive</label>
              <div className="flex h-10 items-center rounded-md border border-input bg-secondary/20 px-3 font-mono text-sm">
                {quoteLoading ? "Quoting…" : quote || "—"}
              </div>
              {tokenSelect(toAddress, setToAddress, tokenChoices)}
            </div>
          </div>
          {quoteError && <p className="text-xs text-amber-600">{quoteError}</p>}
          {quote && toToken && <p className="text-xs text-muted-foreground">Estimated output: {quote} {toToken.symbol}; final output depends on pool state when confirmed.</p>}
          <Button onClick={swap} disabled={swapping || !dexReady || !account || !quote} className="w-full gap-2">
            {swapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownUp className="h-4 w-4" />}
            {swapping ? "Swapping…" : "Swap on GYDS Testnet"}
          </Button>
          {fromToken?.address === "NATIVE" && <p className="text-xs text-muted-foreground">Native GYDS swaps use the DEX’s WGYDS wrapper pool.</p>}
          {toToken?.address === "NATIVE" && <p className="text-xs text-muted-foreground">Output WGYDS is unwrapped and sent to your wallet as native GYDS.</p>}
        </div>
      </section>

      {wrappedNative && account && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Wrap or unwrap native GYDS</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">WGYDS is the ERC-20 representation used for liquidity pools. 1 WGYDS is backed by 1 native GYDS on this testnet contract.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="number" min="0" step="any" value={wrappingAmount} onChange={(event) => setWrappingAmount(event.target.value)} placeholder="Amount of GYDS" />
            <Button variant="outline" disabled={wrapping} onClick={() => void wrapNative(false)}>{wrapping ? "Working…" : "Wrap GYDS"}</Button>
            <Button variant="outline" disabled={wrapping} onClick={() => void wrapNative(true)}>{wrapping ? "Working…" : "Unwrap WGYDS"}</Button>
            <Button variant="ghost" disabled={Boolean(walletImporting)} onClick={() => {
              const wrapped = tokens.find((token) => token.isWrappedNative);
              if (wrapped) void importTestnetToken(wrapped);
            }} className="gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Add WGYDS to wallet
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Droplets className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Liquidity</h2>
            <p className="text-xs text-muted-foreground">Add a pool or remove your LP share. Standard ERC-20 tokens only.</p>
          </div>
        </div>
        {erc20Choices.length < 2 ? (
          <p className="text-sm text-muted-foreground">Add at least two testnet ERC-20 tokens, including WGYDS if creating a GYDS pool.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Pool token A</label>{tokenSelect(tokenAAddress, setTokenAAddress, erc20Choices)}</div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Pool token B</label>{tokenSelect(tokenBAddress, setTokenBAddress, erc20Choices)}</div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              {poolLoading ? <p className="text-xs text-muted-foreground">Loading pool…</p> : poolSnapshot?.exists ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <p>Pool: {displayAmount(poolSnapshot.reserveA, tokenA?.decimals ?? 18)} {tokenA?.symbol} / {displayAmount(poolSnapshot.reserveB, tokenB?.decimals ?? 18)} {tokenB?.symbol}</p>
                  <p>Your LP share: {poolSnapshot.totalShares > 0n ? `${(Number(poolSnapshot.userShares * 10000n / poolSnapshot.totalShares) / 100).toFixed(2)}%` : "0.00%"}</p>
                </div>
              ) : <p className="text-xs text-muted-foreground">No pool yet. The first liquidity deposit creates it.</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Amount {tokenA?.symbol || "A"}</label><Input type="number" min="0" step="any" value={amountA} onChange={(event) => setAmountA(event.target.value)} placeholder="0.0" /></div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Amount {tokenB?.symbol || "B"}</label><Input type="number" min="0" step="any" value={amountB} onChange={(event) => setAmountB(event.target.value)} placeholder="0.0" /></div>
            </div>
            <Button onClick={addLiquidity} disabled={addingLiquidity || !account || !dexReady} className="gap-2">
              {addingLiquidity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {addingLiquidity ? "Adding liquidity…" : "Add liquidity"}
            </Button>
            {poolSnapshot?.userShares && poolSnapshot.userShares > 0n && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <label className="text-xs text-muted-foreground">Remove</label>
                <select value={removePercent} onChange={(event) => setRemovePercent(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {[25, 50, 75, 100].map((percent) => <option key={percent} value={percent}>{percent}%</option>)}
                </select>
                <Button variant="outline" onClick={removeLiquidity} disabled={removingLiquidity} className="gap-2">
                  {removingLiquidity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplets className="h-4 w-4" />}
                  {removingLiquidity ? "Removing…" : "Remove liquidity"}
                </Button>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => void refreshPool()} disabled={poolLoading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${poolLoading ? "animate-spin" : ""}`} /> Refresh pool
            </Button>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        No contract is deployed by this page automatically. Admins must approve the testnet deployment in their wallet; all swaps, approvals, and liquidity changes require separate wallet confirmation.
      </p>
    </main>
  );
}
