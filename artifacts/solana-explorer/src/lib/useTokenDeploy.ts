import { useState } from "react";
import { BrowserProvider, ContractFactory, JsonRpcProvider, Contract } from "ethers";
import TOKEN_ARTIFACT from "./gyds-token-artifact.json";
import { getEthereumProvider, getEthereumProviderForAccount } from "./ethereumProvider";

const configuredChainId = Number(import.meta.env.VITE_CHAIN_ID || 198282);
export const GYDS_CHAIN_ID   = BigInt(Number.isSafeInteger(configuredChainId) && configuredChainId > 0 ? configuredChainId : 198282);
export const GYDS_CHAIN_HEX  = `0x${GYDS_CHAIN_ID.toString(16)}`;

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
  expectedDeployer?: string;
}

export function formatDeployError(
  error: unknown,
  networkName: string,
  chainId: bigint | number | null,
): string {
  const value = error as any;
  const message = [
    typeof error === "string" ? error : "",
    value?.reason,
    value?.shortMessage,
    value?.message,
    value?.info?.error?.message,
    value?.error?.message,
    value?.data?.message,
  ].filter((part) => typeof part === "string" && part.length > 0).join(" ");

  if (/no asset fund|no native gyds|insufficient funds|funds for gas|not enough funds|insufficient balance|balance too low/i.test(message)) {
    const chainText = chainId === null ? "" : ` (chain ID ${chainId})`;
    return `This wallet does not have enough native GYDS to pay deployment fees on ${networkName}${chainText}. Fund the same admin wallet with native GYDS on this network, then retry. Token balances such as GYD or tUSDT cannot pay gas.`;
  }

  return message.replace(/\(action=.*/, "").trim() || "Deployment failed";
}

export function useTokenDeploy(
  rpcUrl: string,
  selectedChainId: number | null = Number(GYDS_CHAIN_ID),
  selectedNetworkName = "GYDS Network",
) {
  const [status,          setStatus]          = useState<DeployStatus>("idle");
  const [txHash,          setTxHash]          = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [error,           setError]           = useState<string | null>(null);
  const [deployer,        setDeployer]        = useState<string | null>(null);

  const deploy = async (params: DeployParams): Promise<DeployResult | null> => {
    let activeChainId: bigint | null = null;
    const ethereum = params.expectedDeployer
      ? await getEthereumProviderForAccount(params.expectedDeployer)
      : getEthereumProvider();
    if (!ethereum) {
      setError("Could not find the connected admin wallet. Reconnect the same authorized wallet, then try again.");
      setStatus("error");
      return null;
    }

    try {
      setStatus("connecting");
      setError(null);
      setTxHash(null);
      setContractAddress(null);

      // Request accounts
      const provider = new BrowserProvider(ethereum as any);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      if (params.expectedDeployer && signer.address.toLowerCase() !== params.expectedDeployer.toLowerCase()) {
        throw new Error("Connect the admin wallet that will own this token before deploying GYD.");
      }
      setDeployer(signer.address);

      // Confirm the selected RPC and wallet target the same chain. Custom RPC
      // chain IDs are discovered from the endpoint instead of guessed.
      const rpcProvider = new JsonRpcProvider(rpcUrl);
      const rpcNetwork = await rpcProvider.getNetwork();
      const targetChainId = selectedChainId === null
        ? rpcNetwork.chainId
        : BigInt(selectedChainId);
      activeChainId = targetChainId;
      if (rpcNetwork.chainId !== targetChainId) {
        throw new Error(`Selected RPC is on chain ${rpcNetwork.chainId}; expected ${targetChainId}.`);
      }
      const targetChainHex = `0x${targetChainId.toString(16)}`;

      // Ensure we're on the selected GYDS network
      const network = await provider.getNetwork();
      if (network.chainId !== targetChainId) {
        setStatus("switching");
        try {
          await provider.send("wallet_switchEthereumChain", [{ chainId: targetChainHex }]);
        } catch (switchErr: any) {
          if (switchErr.code === 4902 || switchErr.code === -32603) {
            // Network not in MetaMask — add it
            await provider.send("wallet_addEthereumChain", [{
              chainId:         targetChainHex,
              chainName:       selectedNetworkName,
              rpcUrls:         [rpcUrl],
              nativeCurrency:  { name: "GYDSChain", symbol: "GYDS", decimals: 18 },
            }]);
            // After adding, switch again
            await provider.send("wallet_switchEthereumChain", [{ chainId: targetChainHex }]);
          } else {
            throw switchErr;
          }
        }
        // Re-acquire signer after switch
        const refreshed = new BrowserProvider(ethereum);
        const refreshedSigner = await refreshed.getSigner();
        if (params.expectedDeployer && refreshedSigner.address.toLowerCase() !== params.expectedDeployer.toLowerCase()) {
          throw new Error("The connected wallet changed. Reconnect the admin wallet that will own this token.");
        }
        setDeployer(refreshedSigner.address);

        // Deploy
        return await _deploy(refreshedSigner, params, targetChainId);
      }

      return await _deploy(signer, params, targetChainId);
    } catch (e: any) {
      setError(formatDeployError(e, selectedNetworkName, activeChainId ?? selectedChainId));
      setStatus("error");
      return null;
    }
  };

  const _deploy = async (signer: any, params: DeployParams, chainId: bigint): Promise<DeployResult | null> => {
    if (params.expectedDeployer && signer.address.toLowerCase() !== params.expectedDeployer.toLowerCase()) {
      throw new Error("The connected wallet does not match the authenticated admin wallet.");
    }
    setStatus("deploying");

    const balance = await signer.provider.getBalance(signer.address);
    if (balance === 0n) {
      throw new Error("NO_NATIVE_GYDS_FOR_GAS");
    }

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
