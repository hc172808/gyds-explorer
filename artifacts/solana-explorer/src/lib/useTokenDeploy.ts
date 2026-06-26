import { useState } from "react";
import { BrowserProvider, ContractFactory, JsonRpcProvider, Contract } from "ethers";
import TOKEN_ARTIFACT from "./gyds-token-artifact.json";

export const GYDS_CHAIN_ID   = 29987n;
export const GYDS_CHAIN_HEX  = "0x7523";

export type DeployStatus = "idle" | "connecting" | "switching" | "deploying" | "confirming" | "success" | "error";

export interface DeployResult {
  contractAddress: string;
  txHash: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  mintable: boolean;
  deployedAt: string;
}

export interface DeployParams {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  mintable: boolean;
}

export function useTokenDeploy(rpcUrl: string) {
  const [status,          setStatus]          = useState<DeployStatus>("idle");
  const [txHash,          setTxHash]          = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [error,           setError]           = useState<string | null>(null);
  const [deployer,        setDeployer]        = useState<string | null>(null);

  const deploy = async (params: DeployParams): Promise<DeployResult | null> => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setError("MetaMask not detected. Install MetaMask and configure the GYDS network.");
      setStatus("error");
      return null;
    }

    try {
      setStatus("connecting");
      setError(null);
      setTxHash(null);
      setContractAddress(null);

      // Request accounts
      const provider = new BrowserProvider(ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      setDeployer(signer.address);

      // Ensure we're on GYDS network
      const network = await provider.getNetwork();
      if (network.chainId !== GYDS_CHAIN_ID) {
        setStatus("switching");
        try {
          await provider.send("wallet_switchEthereumChain", [{ chainId: GYDS_CHAIN_HEX }]);
        } catch (switchErr: any) {
          if (switchErr.code === 4902 || switchErr.code === -32603) {
            // Network not in MetaMask — add it
            await provider.send("wallet_addEthereumChain", [{
              chainId:         GYDS_CHAIN_HEX,
              chainName:       "GYDS Network",
              rpcUrls:         [rpcUrl],
              nativeCurrency:  { name: "GYDS", symbol: "GYDS", decimals: 18 },
            }]);
            // After adding, switch again
            await provider.send("wallet_switchEthereumChain", [{ chainId: GYDS_CHAIN_HEX }]);
          } else {
            throw switchErr;
          }
        }
        // Re-acquire signer after switch
        const refreshed = new BrowserProvider(ethereum);
        const refreshedSigner = await refreshed.getSigner();
        setDeployer(refreshedSigner.address);

        // Deploy
        return await _deploy(refreshedSigner, params);
      }

      return await _deploy(signer, params);
    } catch (e: any) {
      const msg = e?.reason || e?.shortMessage || e?.message || "Deployment failed";
      setError(msg.replace(/\(action=.*/, "").trim());
      setStatus("error");
      return null;
    }
  };

  const _deploy = async (signer: any, params: DeployParams): Promise<DeployResult | null> => {
    setStatus("deploying");

    const factory  = new ContractFactory(TOKEN_ARTIFACT.abi, TOKEN_ARTIFACT.bytecode, signer);
    const contract = await factory.deploy(
      params.name,
      params.symbol,
      params.decimals,
      BigInt(params.initialSupply),
      params.mintable,
    );

    const hash = contract.deploymentTransaction()?.hash ?? "";
    setTxHash(hash);
    setStatus("confirming");

    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    setContractAddress(addr);
    setStatus("success");

    return {
      contractAddress: addr,
      txHash:          hash,
      name:            params.name,
      symbol:          params.symbol,
      decimals:        params.decimals,
      supply:          params.initialSupply,
      mintable:        params.mintable,
      deployedAt:      new Date().toISOString(),
    };
  };

  const reset = () => {
    setStatus("idle");
    setTxHash(null);
    setContractAddress(null);
    setError(null);
    setDeployer(null);
  };

  return { deploy, reset, status, txHash, contractAddress, error, deployer };
}

// ── ERC-20 balance fetcher ────────────────────────────────────────────────────
const ERC20_BALANCE_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
];

export interface TokenBalance {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  totalSupply: bigint;
  error?: string;
}

export async function fetchTokenBalances(
  walletAddress: string,
  tokenAddresses: string[],
  rpcUrl: string,
): Promise<TokenBalance[]> {
  const provider = new JsonRpcProvider(rpcUrl);
  const results: TokenBalance[] = [];

  await Promise.all(
    tokenAddresses.map(async (addr) => {
      try {
        const contract = new Contract(addr, ERC20_BALANCE_ABI, provider);
        const [name, symbol, decimals, balance, totalSupply] = await Promise.all([
          contract.name(),
          contract.symbol(),
          contract.decimals(),
          contract.balanceOf(walletAddress),
          contract.totalSupply(),
        ]);
        results.push({ contractAddress: addr, name, symbol, decimals: Number(decimals), balance, totalSupply });
      } catch (e: any) {
        results.push({
          contractAddress: addr,
          name: "Unknown",
          symbol: "???",
          decimals: 18,
          balance: 0n,
          totalSupply: 0n,
          error: e.message?.slice(0, 80),
        });
      }
    }),
  );

  return results.sort((a, b) => (b.balance > a.balance ? 1 : -1));
}
