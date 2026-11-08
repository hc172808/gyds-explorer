import { GYDS_CHAIN_HEX, GYDS_CHAIN_ID } from "./useTokenDeploy";
import { NETWORK_CHAIN_IDS } from "./networkConfig";

export interface WalletNetworkConfig {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl: string;
  iconUrl: string;
}

export const GYDS_NETWORK: WalletNetworkConfig = {
  chainId: GYDS_CHAIN_HEX,
  chainName: import.meta.env.VITE_NATIVE_COIN_NAME || "GYDSChain",
  nativeCurrency: {
    name: import.meta.env.VITE_NATIVE_COIN_NAME || "GYDSChain",
    symbol: import.meta.env.VITE_NATIVE_COIN_SYMBOL || "GYDS",
    decimals: 18,
  },
  blockExplorerUrl: import.meta.env.VITE_EXPLORER_URL || window.location.origin,
  iconUrl: import.meta.env.VITE_NATIVE_COIN_LOGO_URL || "/assets/gyds-logo.svg",
};

export const GYD_TOKEN = {
  address: import.meta.env.VITE_GYD_TOKEN_ADDRESS || "",
  symbol: import.meta.env.VITE_GYD_SYMBOL || "GYD",
  decimals: Number(import.meta.env.VITE_GYD_DECIMALS || 6),
  image: import.meta.env.VITE_GYD_LOGO_URL || "/assets/gyd-logo.svg",
} as const;

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: EthereumProvider[];
};

function injectedEthereumProviders(): EthereumProvider[] {
  const walletWindow = window as Window & {
    ethereum?: EthereumProvider;
    phantom?: { ethereum?: EthereumProvider };
    trustwallet?: { ethereum?: EthereumProvider };
    trustWallet?: { ethereum?: EthereumProvider };
  };
  const ethereum = walletWindow.ethereum;
  return [
    ...(Array.isArray(ethereum?.providers) ? ethereum.providers : []),
    ethereum,
    walletWindow.phantom?.ethereum,
    walletWindow.trustwallet?.ethereum,
    walletWindow.trustWallet?.ethereum,
  ].filter((provider): provider is EthereumProvider => Boolean(provider));
}

export function getEthereumProvider(): EthereumProvider | null {
  // Multiple wallet extensions can inject one provider that proxies requests
  // through a fragile transport. Prefer MetaMask, then Phantom, while also
  // supporting Trust Wallet and other EIP-1193 injected wallets.
  const candidates = [...new Set(injectedEthereumProviders())];
  return candidates.find((provider) => provider.isMetaMask)
    ?? candidates.find((provider) => provider.isPhantom)
    ?? candidates.find((provider) => provider.isTrust || provider.isTrustWallet)
    ?? candidates[0]
    ?? null;
}

/** Find the injected wallet that currently exposes the account used by the page. */
export async function getEthereumProviderForAccount(accountAddress: string): Promise<EthereumProvider | null> {
  const candidates = new Set(injectedEthereumProviders());
  const announcements: EthereumProvider[] = [];
  const handleAnnouncement = (event: Event) => {
    const provider = (event as CustomEvent<{ provider?: EthereumProvider }>).detail?.provider;
    if (provider) announcements.push(provider);
  };

  window.addEventListener("eip6963:announceProvider", handleAnnouncement);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 200));
  window.removeEventListener("eip6963:announceProvider", handleAnnouncement);
  announcements.forEach((provider) => candidates.add(provider));

  for (const provider of candidates) {
    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      if (
        Array.isArray(accounts) &&
        accounts.some((account) => typeof account === "string" && account.toLowerCase() === accountAddress.toLowerCase())
      ) {
        return provider;
      }
    } catch {
      // A wallet that is locked or disconnected cannot be used for this action.
    }
  }
  return null;
}

export function getRpcUrls(primaryRpc: string, secondaryRpc?: string): string[] {
  return [primaryRpc, secondaryRpc]
    .map((url) => {
      if (!url || !url.startsWith("/")) return url;
      try {
        return new URL(url, window.location.origin).toString();
      } catch {
        return url;
      }
    })
    .filter((url): url is string => Boolean(url))
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function isWalletSafeRpc(url: string) {
  // Wallets require HTTPS for public hosts but accept HTTP on localhost / plain IPs.
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === "https:") return true;
    if (protocol !== "http:") return false;
    return hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  } catch {
    return false;
  }
}

export async function addGydsNetwork(
  rpcUrls: string[],
  network: WalletNetworkConfig = GYDS_NETWORK,
  provider = getEthereumProvider(),
) {
  if (!provider) throw new Error("No compatible wallet was detected. Use the manual setup details below.");
  if (!rpcUrls.length || !rpcUrls.every(isWalletSafeRpc)) {
    throw new Error("A reachable RPC endpoint is required (HTTPS, or HTTP on localhost/an IP address).");
  }


  await provider.request({
    method: "wallet_addEthereumChain",
    params: [{
      chainId: network.chainId,
      chainName: network.chainName,
      rpcUrls,
      nativeCurrency: network.nativeCurrency,
      blockExplorerUrls: [network.blockExplorerUrl],
      iconUrls: [new URL(network.iconUrl, window.location.origin).toString()],
    }],
  });
}

export async function switchToGydsNetwork(
  provider: EthereumProvider,
  rpcUrls: string[],
  network: "mainnet" | "testnet" = "mainnet",
) {
  const chainId = network === "testnet" ? BigInt(NETWORK_CHAIN_IDS.testnet) : GYDS_CHAIN_ID;
  const chainHex = `0x${chainId.toString(16)}`;
  const walletNetwork: WalletNetworkConfig = network === "testnet"
    ? { ...GYDS_NETWORK, chainId: chainHex, chainName: "GYDS Testnet" }
    : GYDS_NETWORK;
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (typeof currentChainId === "string" && BigInt(currentChainId) === chainId) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await addGydsNetwork(rpcUrls, walletNetwork, provider);
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  }
}

export interface WalletTokenAsset {
  address: string;
  symbol: string;
  decimals: number;
  image?: string | null;
}

export async function addTokenToWallet(
  asset: WalletTokenAsset,
  provider = getEthereumProvider(),
) {
  if (!provider) throw new Error("No compatible Web3 wallet was detected.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(asset.address)) throw new Error("The token contract address is invalid.");
  if (!asset.symbol.trim() || !Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) {
    throw new Error("Token symbol or decimals are invalid.");
  }

  const accepted = await provider.request({
    method: "wallet_watchAsset",
    params: [{
      type: "ERC20",
      options: {
        address: asset.address,
        symbol: asset.symbol.trim(),
        decimals: asset.decimals,
        ...(asset.image ? { image: new URL(asset.image, window.location.origin).toString() } : {}),
      },
    }],
  });
  if (accepted === false) throw new Error("The wallet declined the token import.");
}

export async function addGydToken(provider = getEthereumProvider()) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(GYD_TOKEN.address)) {
    throw new Error("The official GYD contract address has not been configured yet.");
  }

  await addTokenToWallet({
    address: GYD_TOKEN.address,
    symbol: GYD_TOKEN.symbol,
    decimals: GYD_TOKEN.decimals,
    image: GYD_TOKEN.image,
  }, provider);
}

export function getWalletError(error: unknown): string {
  const code = (error as { code?: number })?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/broadcast\s*channel\s*unavailable/i.test(message)) {
    return "Your wallet cannot communicate with this page. Open the explorer in a normal browser tab (not an embedded preview), unlock the wallet, and try again.";
  }
  if (code === 4001) return "The request was rejected in your wallet.";
  if (code === 4002) return "The wallet request timed out. Unlock the wallet and try again.";
  if (code === -32002) return "A wallet request is already pending. Open the wallet extension and finish it.";
  if (code === -32603) return "The wallet could not complete the request. Check that the GYDS RPC URL is reachable.";
  if (code === 4902) return "This wallet could not add the network. Use the manual setup details below.";
  return message || "The wallet request could not be completed.";
}

export function isGydConfigured() {
  return /^0x[a-fA-F0-9]{40}$/.test(GYD_TOKEN.address);
}

export { GYDS_CHAIN_ID };