import { createContext, useContext, useState, ReactNode } from "react";

export type NetworkType = "mainnet" | "testnet" | "devnet" | "custom";

interface NetworkConfig {
  name: string;
  type: NetworkType;
  rpcEndpoints: string[];
}

const NETWORKS: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    name: "Mainnet",
    type: "mainnet",
    rpcEndpoints: ["https://rpc.netlifegy.com", "https://rpc2.netlifegy.com"],
  },
  testnet: {
    name: "Testnet",
    type: "testnet",
    rpcEndpoints: ["https://rpc.netlifegy.com", "https://rpc2.netlifegy.com"],
  },
  devnet: {
    name: "Devnet",
    type: "devnet",
    rpcEndpoints: ["https://rpc.netlifegy.com", "https://rpc2.netlifegy.com"],
  },
  custom: {
    name: "Custom RPC",
    type: "custom",
    rpcEndpoints: ["https://rpc.netlifegy.com"],
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
