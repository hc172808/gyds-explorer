import { API_BASE_URL } from "./apiBase";

export type NetworkType = "mainnet" | "testnet" | "custom";

// Upstream endpoints are configured by an admin or in the API server's .env.
// The browser only calls the same-origin /api/rpc proxy.
export const DEFAULT_PRIMARY_RPC = "";

export const NETWORK_CHAIN_IDS = {
  mainnet: 198282,
  testnet: 198281,
};
export const TESTNET_ADMIN_WALLET = (
  import.meta.env.VITE_TESTNET_ADMIN_WALLET || "0x6422d12bfaddee5142bfad21b3006a74d09017b1"
).toLowerCase();

export interface SelectedNetworkConfig {
  type: NetworkType;
  name: string;
  rpcEndpoints: string[];
  chainId: number | null;
  customRpcUrl?: string;
}

export function fixedRpcEndpoint(network: "mainnet" | "testnet"): string {
  return `${API_BASE_URL}/rpc?network=${network}`;
}

export function isValidHttpRpcUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

let selectedNetwork: SelectedNetworkConfig = {
  type: "mainnet",
  name: "Mainnet",
  rpcEndpoints: [fixedRpcEndpoint("mainnet")],
  chainId: NETWORK_CHAIN_IDS.mainnet,
};

export function setSelectedNetworkConfig(config: SelectedNetworkConfig) {
  selectedNetwork = config;
}

export function getSelectedNetworkConfig(): SelectedNetworkConfig {
  return selectedNetwork;
}

export function localTokenStorageKey(config: SelectedNetworkConfig = selectedNetwork): string {
  const identity = config.chainId === null ? `custom-${config.customRpcUrl || "unresolved"}` : String(config.chainId);
  return `gyds_deployed_tokens:${config.type}:${identity}`;
}