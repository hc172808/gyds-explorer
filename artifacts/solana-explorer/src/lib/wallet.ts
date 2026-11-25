import { GYDS_CHAIN_HEX, GYDS_CHAIN_ID } from "./useTokenDeploy";
import { NETWORK_CHAIN_IDS } from "./networkConfig";
import { getEthereumProvider } from "./ethereumProvider";
import { getNativeCoinForNetwork } from "./coins";
import type { EthereumProvider } from "./ethereumProvider";
import type { NetworkType } from "./networkConfig";

export { getEthereumProvider, getEthereumProviderForAccount } from "./ethereumProvider";
export type { EthereumProvider } from "./ethereumProvider";

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

const RPC_CHECK_TIMEOUT_MS = 5000;

function currentOrigin() {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

export const GYDS_NETWORK: WalletNetworkConfig = {
  chainId: GYDS_CHAIN_HEX,
  chainName: import.meta.env.VITE_NATIVE_COIN_NAME || "GYDSChain",
  nativeCurrency: {
    name: import.meta.env.VITE_NATIVE_COIN_NAME || "GYDSChain",
    symbol: import.meta.env.VITE_NATIVE_COIN_SYMBOL || "GYDS",
    decimals: 18,
  },
  blockExplorerUrl: import.meta.env.VITE_EXPLORER_URL || currentOrigin(),
  iconUrl: import.meta.env.VITE_NATIVE_COIN_LOGO_URL || "/assets/gyds-logo.svg",
};

export function createWalletNetworkConfig(networkType: NetworkType, chainId: bigint): WalletNetworkConfig {
  const nativeCoin = getNativeCoinForNetwork(networkType);
  return {
    ...GYDS_NETWORK,
    chainId: `0x${chainId.toString(16)}`,
    chainName: networkType === "mainnet"
      ? GYDS_NETWORK.chainName
      : networkType === "testnet"
        ? "GYDS Testnet"
        : "GYDS Custom Network",
    nativeCurrency: networkType === "mainnet"
      ? GYDS_NETWORK.nativeCurrency
      : {
          name: nativeCoin.name,
          symbol: nativeCoin.symbol,
          decimals: nativeCoin.decimals,
        },
  };
}

export const GYD_TOKEN = {
  address: import.meta.env.VITE_GYD_TOKEN_ADDRESS || "",
  symbol: import.meta.env.VITE_GYD_SYMBOL || "GYD",
  decimals: Number(import.meta.env.VITE_GYD_DECIMALS || 6),
  image: import.meta.env.VITE_GYD_LOGO_URL || "/assets/gyd-logo.svg",
} as const;

export function getRpcUrls(primaryRpc: string, secondaryRpc?: string): string[] {
  return [primaryRpc, secondaryRpc]
    .map((url) => {
      if (!url || !url.startsWith("/")) return url;
      try {
        return new URL(url, currentOrigin()).toString();
      } catch {
        return url;
      }
    })
    .filter((url): url is string => Boolean(url))
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function isWalletSafeRpc(url: string) {
  // Wallets require HTTPS for public hosts but accept HTTP on localhost / IPs.
  try {
    const parsed = new URL(url);
    const { protocol, hostname } = parsed;
    if (parsed.username || parsed.password) return false;
    if (protocol === "https:") return true;
    if (protocol !== "http:") return false;
    return hostname === "localhost" || isIPv4Address(hostname) || hostname === "[::1]";
  } catch {
    return false;
  }
}

function isIPv4Address(hostname: string) {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function parseChainId(chainId: string) {
  if (!/^0x[0-9a-f]+$/i.test(chainId)) {
    throw new Error("The selected network has an invalid hexadecimal chain ID.");
  }
  const parsed = BigInt(chainId);
  if (parsed <= 0n) throw new Error("The selected network chain ID must be greater than zero.");
  return parsed;
}

function absoluteHttpUrl(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value, currentOrigin());
  } catch {
    throw new Error(`The ${label} URL is invalid.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`The ${label} URL must be a credential-free HTTP or HTTPS URL.`);
  }
  return parsed.toString();
}

export function buildWalletNetworkParams(rpcUrls: string[], network: WalletNetworkConfig) {
  if (!rpcUrls.length || !rpcUrls.every(isWalletSafeRpc)) {
    throw new Error("A valid RPC URL is required (HTTPS, or HTTP on localhost/an IP address).");
  }
  parseChainId(network.chainId);
  if (!network.chainName.trim()) throw new Error("The network name is required.");
  if (
    !network.nativeCurrency.name.trim() ||
    !network.nativeCurrency.symbol.trim() ||
    !Number.isInteger(network.nativeCurrency.decimals) ||
    network.nativeCurrency.decimals < 0 ||
    network.nativeCurrency.decimals > 255
  ) {
    throw new Error("The network's native currency metadata is invalid.");
  }

  return {
    chainId: network.chainId.toLowerCase(),
    chainName: network.chainName.trim(),
    rpcUrls: [...new Set(rpcUrls)],
    nativeCurrency: { ...network.nativeCurrency },
    blockExplorerUrls: [absoluteHttpUrl(network.blockExplorerUrl, "block explorer")],
    iconUrls: [absoluteHttpUrl(network.iconUrl, "network icon")],
  };
}

function wrongChainFromProxyDetail(detail: unknown, expectedChainId?: bigint) {
  if (typeof detail !== "string") return null;
  const match = detail.match(/wrong chain id:\s*expected\s+(0x[0-9a-f]+),\s*received\s+(0x[0-9a-f]+)/i);
  if (!match) return null;
  const expected = expectedChainId ?? BigInt(match[1]);
  return new Error(`Wrong RPC chain ID: expected ${expected}, but the endpoint reports ${BigInt(match[2])}.`);
}

export async function getRpcChainId(
  rpcUrls: string[],
  expectedChainId?: bigint,
  fetcher: typeof fetch = fetch,
): Promise<bigint> {
  if (!rpcUrls.length || !rpcUrls.every(isWalletSafeRpc)) {
    throw new Error("A valid RPC URL is required (HTTPS, or HTTP on localhost/an IP address).");
  }

  let detectedChainId: bigint | null = null;
  for (const rpcUrl of [...new Set(rpcUrls)]) {
    let response: Response;
    try {
      response = await fetcher(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
        signal: AbortSignal.timeout(RPC_CHECK_TIMEOUT_MS),
      });
    } catch (error) {
      const errorName = (error as { name?: string })?.name;
      if (errorName === "TimeoutError" || errorName === "AbortError") {
        throw new Error("The RPC request timed out while checking the selected network.");
      }
      throw new Error("The selected RPC endpoint could not be reached. Check its availability and try again.");
    }

    let payload: { result?: unknown; error?: unknown; detail?: unknown };
    try {
      payload = await response.json() as typeof payload;
    } catch {
      throw new Error("The selected RPC endpoint returned invalid JSON.");
    }
    if (!response.ok) {
      const wrongChainError = wrongChainFromProxyDetail(payload.detail, expectedChainId);
      if (wrongChainError) throw wrongChainError;
      throw new Error(`The selected RPC endpoint returned HTTP ${response.status}.`);
    }
    if (payload.error) throw new Error("The selected RPC endpoint rejected the chain ID check.");
    if (typeof payload.result !== "string" || !/^0x[0-9a-f]+$/i.test(payload.result)) {
      throw new Error("The selected RPC endpoint returned an invalid chain ID.");
    }

    const chainId = BigInt(payload.result);
    if (chainId <= 0n) throw new Error("The selected RPC endpoint returned an invalid chain ID.");
    if (expectedChainId !== undefined && chainId !== expectedChainId) {
      throw new Error(`Wrong RPC chain ID: expected ${expectedChainId}, but the endpoint reports ${chainId}.`);
    }
    if (detectedChainId !== null && chainId !== detectedChainId) {
      throw new Error("The selected RPC endpoints report different chain IDs.");
    }
    detectedChainId = chainId;
  }

  if (detectedChainId === null) throw new Error("No usable RPC endpoint was provided.");
  return detectedChainId;
}

export async function addGydsNetwork(
  rpcUrls: string[],
  network: WalletNetworkConfig = GYDS_NETWORK,
  provider = getEthereumProvider(),
  fetcher: typeof fetch = fetch,
) {
  if (!provider) throw new Error("No compatible wallet was detected. Use the manual setup details below.");
  const params = buildWalletNetworkParams(rpcUrls, network);
  await getRpcChainId(rpcUrls, parseChainId(network.chainId), fetcher);
  const result = await provider.request({
    method: "wallet_addEthereumChain",
    params: [params],
  });
  if (result === false) throw new Error("The wallet declined adding this network.");
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
  const errorRecord = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : undefined;
  const code = typeof errorRecord?.code === "number" ? errorRecord.code : undefined;
  const message = error instanceof Error
    ? error.message
    : typeof errorRecord?.message === "string"
      ? errorRecord.message
      : String(error ?? "");
  if (
    message === `Wrong RPC chain ID: expected ${NETWORK_CHAIN_IDS.mainnet}, but the endpoint reports ${NETWORK_CHAIN_IDS.testnet}.`
  ) {
    return "This action is set to Mainnet, but the available RPC is the private Testnet. Select Testnet in the explorer’s network menu to add the local test network. Mainnet needs its own chain ID 198282 RPC.";
  }
  if (/broadcast\s*channel\s*unavailable/i.test(message)) {
    return "Your wallet cannot communicate with this page. Open the explorer in a normal browser tab (not an embedded preview), unlock the wallet, and try again.";
  }
  if (code === 4001) return "The request was rejected in your wallet.";
  if (code === 4002) return "The wallet request timed out. Unlock the wallet and try again.";
  if (code === -32002) return "A wallet request is already pending. Open the wallet extension and finish it.";
  if (code === -32603) return "The wallet could not complete the request. Check that the GYDS RPC URL is reachable.";
  if (code === -32601 || code === 4200) return "This wallet does not support adding networks. Use the manual setup details below.";
  if (code === -32602) return "The wallet rejected the network details. Check the chain ID, RPC, currency, and explorer values.";
  if (code === 4902) return "This wallet could not add the network. Use the manual setup details below.";
  return message || "The wallet request could not be completed.";
}

export function isGydConfigured() {
  return /^0x[a-fA-F0-9]{40}$/.test(GYD_TOKEN.address);
}

export { GYDS_CHAIN_ID };