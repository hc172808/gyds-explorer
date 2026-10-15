import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { fixedRpcEndpoint, NETWORK_CHAIN_IDS, setSelectedNetworkConfig, type NetworkType } from "@/lib/networkConfig";

export type { NetworkType } from "@/lib/networkConfig";
const DEFAULT_NETWORK_TYPE: NetworkType = "mainnet";

interface NetworkConfig {
  name: string;
  type: NetworkType;
  rpcEndpoints: string[];
  chainId: number | null;
}

// Browser RPC consumers always use the API proxy. Upstream node URLs remain
// server-side and are exposed only through authenticated admin settings.
const ENV_RPC1 = "/api/rpc";
const ENV_RPC2 = "/api/rpc";

const LS_KEY_RPC1     = "gyds_rpc_primary";
const LS_KEY_RPC2     = "gyds_rpc_secondary";
const LS_KEY_BOOTNODE = "gyds_bootnode_enode";
const LS_KEY_NETWORK  = "gyds_network_type";

function resolveRpcUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return trimmed;
  try {
    return new URL(trimmed, window.location.origin).toString();
  } catch {
    return trimmed;
  }
}

function lsGet(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

interface NetworkContextType {
  network: NetworkConfig;
  networkType: NetworkType;
  setNetworkType: (type: NetworkType) => void;
  customRpcUrl: string;
  setCustomRpcUrl: (url: string) => void;
  primaryRpc: string;
  secondaryRpc: string;
  bootnodeEnode: string;
  setPrimaryRpc: (url: string) => void;
  setSecondaryRpc: (url: string) => void;
  setBootnodeEnode: (enode: string) => void;
  resetToDefaults: () => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const [networkType, setNetworkTypeState] = useState<NetworkType>(
    () => {
      const stored = lsGet(LS_KEY_NETWORK, DEFAULT_NETWORK_TYPE);
      return stored === "custom" ? "custom" : "mainnet";
    }
  );
  const [customRpcUrl, setCustomRpcUrlState] = useState("");
  const [primaryRpc, setPrimaryRpcState]     = useState(() => resolveRpcUrl(ENV_RPC1));
  const [secondaryRpc, setSecondaryRpcState] = useState(() => resolveRpcUrl(ENV_RPC2));
  const [bootnodeEnode, setBootnodeEnodeState] = useState(() => lsGet(LS_KEY_BOOTNODE, ""));

  useEffect(() => { lsSet(LS_KEY_NETWORK, networkType); }, [networkType]);
  useEffect(() => { lsSet(LS_KEY_BOOTNODE, bootnodeEnode); }, [bootnodeEnode]);
  useEffect(() => {
    // Remove upstream URLs saved by older builds from browser storage.
    try {
      localStorage.removeItem(LS_KEY_RPC1);
      localStorage.removeItem(LS_KEY_RPC2);
      localStorage.removeItem("gyds_custom_rpc_url");
    } catch {
      /* ignore */
    }
  }, []);

  const setNetworkType = (type: NetworkType) => setNetworkTypeState(type);
  const setCustomRpcUrl = (url: string) => setCustomRpcUrlState(url);
  const setPrimaryRpc = (url: string) => setPrimaryRpcState(resolveRpcUrl(url));
  const setSecondaryRpc = (url: string) => setSecondaryRpcState(resolveRpcUrl(url));
  const setBootnodeEnode = (enode: string) => setBootnodeEnodeState(enode);

  const resetToDefaults = () => {
    setPrimaryRpcState(resolveRpcUrl(ENV_RPC1));
    setSecondaryRpcState(resolveRpcUrl(ENV_RPC2));
    setBootnodeEnodeState("");
    setNetworkTypeState(DEFAULT_NETWORK_TYPE);
    try {
      localStorage.removeItem(LS_KEY_RPC1);
      localStorage.removeItem(LS_KEY_RPC2);
      localStorage.removeItem(LS_KEY_BOOTNODE);
      localStorage.removeItem(LS_KEY_NETWORK);
    } catch { /* ignore */ }
  };

  const NETWORKS: Record<NetworkType, NetworkConfig> = {
    mainnet: {
      name: "Mainnet",
      type: "mainnet",
      rpcEndpoints: [fixedRpcEndpoint("mainnet")],
      chainId: NETWORK_CHAIN_IDS.mainnet,
    },
    custom: {
      name: "Custom RPC",
      type: "custom",
      rpcEndpoints: customRpcUrl.trim() ? [customRpcUrl.trim()] : [],
      chainId: null,
    },
  };

  const network = NETWORKS[networkType];
  setSelectedNetworkConfig({
    ...network,
    ...(networkType === "custom" ? { customRpcUrl: customRpcUrl.trim() } : {}),
  });

  return (
    <NetworkContext.Provider value={{
      network, networkType, setNetworkType,
      customRpcUrl, setCustomRpcUrl,
      primaryRpc, secondaryRpc, bootnodeEnode,
      setPrimaryRpc, setSecondaryRpc, setBootnodeEnode,
      resetToDefaults,
    }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
};
