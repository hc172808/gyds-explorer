import { createContext, useContext, useState, ReactNode } from "react";

export type NetworkType = "mainnet" | "testnet" | "devnet" | "custom";

interface NetworkConfig {
  name: string;
  type: NetworkType;
  rpcEndpoints: string[];
}

const PRIMARY_RPC = import.meta.env.VITE_RPC_URL || "https://rpc.netlifegy.com";
const SECONDARY_RPC = import.meta.env.VITE_RPC_URL_2 || "https://rpc2.netlifegy.com";

const NETWORKS: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    name: "Mainnet",
    type: "mainnet",
    rpcEndpoints: [PRIMARY_RPC, SECONDARY_RPC],
  },
  testnet: {
    name: "Testnet",
    type: "testnet",
    rpcEndpoints: [PRIMARY_RPC, SECONDARY_RPC],
  },
  devnet: {
    name: "Devnet",
    type: "devnet",
    rpcEndpoints: [PRIMARY_RPC, SECONDARY_RPC],
  },
  custom: {
    name: "Custom RPC",
    type: "custom",
    rpcEndpoints: [PRIMARY_RPC],
  },
};

interface NetworkContextType {
  network: NetworkConfig;
  networkType: NetworkType;
  setNetworkType: (type: NetworkType) => void;
  customRpcUrl: string;
  setCustomRpcUrl: (url: string) => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const [networkType, setNetworkType] = useState<NetworkType>("mainnet");
  const [customRpcUrl, setCustomRpcUrl] = useState("");

  const network = networkType === "custom" && customRpcUrl
    ? { ...NETWORKS.custom, rpcEndpoints: [customRpcUrl] }
    : NETWORKS[networkType];

  return (
    <NetworkContext.Provider value={{ network, networkType, setNetworkType, customRpcUrl, setCustomRpcUrl }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
};
