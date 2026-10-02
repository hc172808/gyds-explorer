export type NetworkType = "mainnet" | "testnet" | "custom";

export const NETWORK_CHAIN_IDS: Record<Exclude<NetworkType, "custom">, number> = {
  mainnet: 198282,
  testnet: 198281,
};

export interface SelectedNetworkConfig {
  type: NetworkType;
  name: string;
  rpcEndpoints: string[];
  chainId: number | null;
  customRpcUrl?: string;
}

export function fixedRpcEndpoint(network: Exclude<NetworkType, "custom">): string {
  return `/api/rpc?network=${network}`;
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
  type: import.meta.env.DEV ? "testnet" : "mainnet",
  name: import.meta.env.DEV ? "Testnet" : "Mainnet",
  rpcEndpoints: [fixedRpcEndpoint(import.meta.env.DEV ? "testnet" : "mainnet")],
  chainId: import.meta.env.DEV ? NETWORK_CHAIN_IDS.testnet : NETWORK_CHAIN_IDS.mainnet,
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