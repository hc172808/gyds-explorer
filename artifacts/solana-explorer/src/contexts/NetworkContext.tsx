import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type NetworkType = "mainnet" | "testnet" | "devnet" | "custom";

interface NetworkConfig {
  name: string;
  type: NetworkType;
  rpcEndpoints: string[];
}

const ENV_RPC1 = import.meta.env.VITE_RPC_URL || "https://rpc.netlifegy.com";
const ENV_RPC2 = import.meta.env.VITE_RPC_URL_2 || "https://rpc2.netlifegy.com";

const LS_KEY_RPC1     = "gyds_rpc_primary";
const LS_KEY_RPC2     = "gyds_rpc_secondary";
const LS_KEY_BOOTNODE = "gyds_bootnode_enode";
const LS_KEY_NETWORK  = "gyds_network_type";

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
    () => (lsGet(LS_KEY_NETWORK, "mainnet") as NetworkType)
  );
  const [customRpcUrl, setCustomRpcUrlState] = useState("");
  const [primaryRpc, setPrimaryRpcState]     = useState(() => lsGet(LS_KEY_RPC1, ENV_RPC1));
  const [secondaryRpc, setSecondaryRpcState] = useState(() => lsGet(LS_KEY_RPC2, ENV_RPC2));
  const [bootnodeEnode, setBootnodeEnodeState] = useState(() => lsGet(LS_KEY_BOOTNODE, ""));

  useEffect(() => { lsSet(LS_KEY_NETWORK, networkType); }, [networkType]);
  useEffect(() => { lsSet(LS_KEY_RPC1, primaryRpc); }, [primaryRpc]);
  useEffect(() => { lsSet(LS_KEY_RPC2, secondaryRpc); }, [secondaryRpc]);
  useEffect(() => { lsSet(LS_KEY_BOOTNODE, bootnodeEnode); }, [bootnodeEnode]);

  const setNetworkType = (type: NetworkType) => setNetworkTypeState(type);
  const setCustomRpcUrl = (url: string) => setCustomRpcUrlState(url);
  const setPrimaryRpc = (url: string) => setPrimaryRpcState(url);
  const setSecondaryRpc = (url: string) => setSecondaryRpcState(url);
  const setBootnodeEnode = (enode: string) => setBootnodeEnodeState(enode);

  const resetToDefaults = () => {
    setPrimaryRpcState(ENV_RPC1);
    setSecondaryRpcState(ENV_RPC2);
    setBootnodeEnodeState("");
    setNetworkTypeState("mainnet");
    try {
      localStorage.removeItem(LS_KEY_RPC1);
      localStorage.removeItem(LS_KEY_RPC2);
      localStorage.removeItem(LS_KEY_BOOTNODE);
      localStorage.removeItem(LS_KEY_NETWORK);
    } catch { /* ignore */ }
  };

  const NETWORKS: Record<NetworkType, NetworkConfig> = {
    mainnet: { name: "Mainnet", type: "mainnet", rpcEndpoints: [primaryRpc, secondaryRpc] },
    testnet: { name: "Testnet", type: "testnet", rpcEndpoints: [primaryRpc, secondaryRpc] },
    devnet:  { name: "Devnet",  type: "devnet",  rpcEndpoints: [primaryRpc, secondaryRpc] },
    custom:  { name: "Custom RPC", type: "custom", rpcEndpoints: [customRpcUrl || primaryRpc] },
  };

  const network =
    networkType === "custom" && customRpcUrl
      ? { ...NETWORKS.custom, rpcEndpoints: [customRpcUrl] }
      : NETWORKS[networkType];

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
