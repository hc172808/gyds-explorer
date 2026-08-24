import { GYDS_CHAIN_HEX, GYDS_CHAIN_ID } from "./useTokenDeploy";

export const GYDS_NETWORK = {
  chainId: GYDS_CHAIN_HEX,
  chainName: import.meta.env.VITE_NATIVE_COIN_NAME || "GYDSChain",
  nativeCurrency: {
    name: import.meta.env.VITE_NATIVE_COIN_NAME || "GYDSChain",
    symbol: import.meta.env.VITE_NATIVE_COIN_SYMBOL || "GYDS",
    decimals: Number(import.meta.env.VITE_NATIVE_COIN_DECIMALS || 18),
  },
  blockExplorerUrl: import.meta.env.VITE_EXPLORER_URL || window.location.origin,
  iconUrl: import.meta.env.VITE_NATIVE_COIN_LOGO_URL || "/assets/gyds-logo.svg",
} as const;

export const GYD_TOKEN = {
  address: import.meta.env.VITE_GYD_TOKEN_ADDRESS || "",
  symbol: import.meta.env.VITE_GYD_SYMBOL || "GYD",
  decimals: Number(import.meta.env.VITE_GYD_DECIMALS || 18),
  image: import.meta.env.VITE_GYD_LOGO_URL || "/assets/gyd-logo.svg",
} as const;

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function getEthereumProvider(): EthereumProvider | null {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum ?? null;
}

export function getRpcUrls(primaryRpc: string, secondaryRpc?: string): string[] {
  return [primaryRpc, secondaryRpc].filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index);
}

export async function addGydsNetwork(rpcUrls: string[], provider = getEthereumProvider()) {
  if (!provider) throw new Error("No compatible wallet was detected. Use the manual setup details below.");
  if (!rpcUrls.length || rpcUrls.some((url) => !/^https:\/\//i.test(url))) {
    throw new Error("A public HTTPS RPC endpoint is required before adding the network.");
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [{
      chainId: GYDS_NETWORK.chainId,
      chainName: GYDS_NETWORK.chainName,
      rpcUrls,
      nativeCurrency: GYDS_NETWORK.nativeCurrency,
      blockExplorerUrls: [GYDS_NETWORK.blockExplorerUrl],
      iconUrls: [new URL(GYDS_NETWORK.iconUrl, window.location.origin).toString()],
    }],
  });
}

export async function addGydToken(provider = getEthereumProvider()) {
  if (!provider) throw new Error("No compatible wallet was detected. Use the manual token import details below.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(GYD_TOKEN.address)) {
    throw new Error("The official GYD contract address has not been configured yet.");
  }

  const accepted = await provider.request({
    method: "wallet_watchAsset",
    params: [{
      type: "ERC20",
      options: {
        address: GYD_TOKEN.address,
        symbol: GYD_TOKEN.symbol,
        decimals: GYD_TOKEN.decimals,
        image: new URL(GYD_TOKEN.image, window.location.origin).toString(),
      },
    }],
  });
  if (accepted === false) throw new Error("The wallet declined the GYD token import.");
}

export function getWalletError(error: unknown): string {
  const code = (error as { code?: number })?.code;
  if (code === 4001) return "The request was rejected in your wallet.";
  if (code === 4902) return "This wallet could not add the network. Use the manual setup details below.";
  return error instanceof Error ? error.message : "The wallet request could not be completed.";
}

export function isGydConfigured() {
  return /^0x[a-fA-F0-9]{40}$/.test(GYD_TOKEN.address);
}

export { GYDS_CHAIN_ID };