import { Block, Transaction, TransactionReceipt, NetworkStats } from "./types";
import { formatUnitsRaw } from "./coins";

export const EXPECTED_CHAIN_ID = 198282;
const RPC_TIMEOUT_MS = 5000;

/** Use the same-origin proxy so public RPC servers do not need browser CORS headers. */
export function getRpcEndpoints(): string[] {
  return ["/api/rpc"];
}

async function callEndpoint(
  endpoint: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `RPC call failed for method "${method}"`);
  }
  if (method === "eth_chainId") {
    const chainId = hexToNumber(data.result as string);
    if (chainId !== EXPECTED_CHAIN_ID) {
      throw new Error(`Wrong chain ID: expected ${EXPECTED_CHAIN_ID}, received ${chainId}`);
    }
  }
  return data.result;
}

/** Calls each configured RPC endpoint in order until one succeeds. */
export async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const endpoints = getRpcEndpoints();
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      return await callEndpoint(endpoint, method, params);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`All RPC endpoints failed for method "${method}"`);
}

export interface RpcEndpointHealth {
  url: string;
  online: boolean;
  blockNumber?: number;
  chainId?: number;
  latencyMs: number;
  error?: string;
}

export async function checkRpcEndpoint(url: string): Promise<RpcEndpointHealth> {
  const started = performance.now();
  try {
    const [blockNumber, chainId] = await Promise.all([
      callEndpoint(url, "eth_blockNumber", []),
      callEndpoint(url, "eth_chainId", []),
    ]);
    if (chainId !== `0x${EXPECTED_CHAIN_ID.toString(16)}`) {
      throw new Error(
        `Wrong chain ID: expected ${EXPECTED_CHAIN_ID}, received ${hexToNumber(chainId as string)}`,
      );
    }
    return {
      url,
      online: true,
      blockNumber: hexToNumber(blockNumber as string),
      chainId: hexToNumber(chainId as string),
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      url,
      online: false,
      latencyMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : "Unreachable",
    };
  }
}

export interface SyncStatus {
  syncing: boolean;
  currentBlock?: number;
  highestBlock?: number;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const result = await rpcCall("eth_syncing");
  if (!result || result === false) return { syncing: false };
  const s = result as { currentBlock: string; highestBlock: string };
  return {
    syncing: true,
    currentBlock: hexToNumber(s.currentBlock),
    highestBlock: hexToNumber(s.highestBlock),
  };
}

export const hexToNumber = (hex: string): number => parseInt(hex, 16);
export const hexToDecimal = (hex: string): string => BigInt(hex).toString();
/** Raw wei (18 decimals) -> GYDS, BigInt-safe with 6 fraction digits. */
export const weiToEther = (wei: string): string =>
  formatUnitsRaw(wei, 18, { maxFractionDigits: 6, minFractionDigits: 6 });
/** Raw wei -> gwei (1e9 wei), used for gas prices only. */
export const gweiFromWei = (wei: string): string =>
  formatUnitsRaw(wei, 9, { maxFractionDigits: 2, minFractionDigits: 2 });

export const formatAddress = (addr: string): string =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const formatTimestamp = (hex: string): string => {
  const ts = hexToNumber(hex);
  return new Date(ts * 1000).toLocaleString();
};

export const timeAgo = (hex: string): string => {
  const ts = hexToNumber(hex) * 1000;
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

export async function getNetworkStats(): Promise<NetworkStats> {
  const [blockNumber, gasPrice, chainId, peerCount] = await Promise.all([
    rpcCall("eth_blockNumber"),
    rpcCall("eth_gasPrice"),
    rpcCall("eth_chainId"),
    rpcCall("net_peerCount").catch(() => "0x0"),
  ]);
  return {
    blockNumber: hexToNumber(blockNumber as string),
    gasPrice: gasPrice as string,
    chainId: hexToNumber(chainId as string),
    peerCount: hexToNumber(peerCount as string),
  };
}

export async function getBlock(blockNumberOrHash: string, full = true): Promise<Block> {
  const isHash = blockNumberOrHash.length === 66;
  const method = isHash ? "eth_getBlockByHash" : "eth_getBlockByNumber";
  const result = await rpcCall(method, [blockNumberOrHash, full]);
  return result as Block;
}

export async function getLatestBlocks(count: number = 10): Promise<Block[]> {
  const latest = (await rpcCall("eth_blockNumber")) as string;
  const latestNum = hexToNumber(latest);
  const promises = Array.from({ length: count }, (_, i) => {
    const num = latestNum - i;
    if (num < 0) return null;
    return getBlock("0x" + num.toString(16), false);
  }).filter(Boolean);
  const blocks = await Promise.all(promises);
  return blocks.filter(Boolean) as Block[];
}

export async function getTransaction(hash: string): Promise<Transaction> {
  const result = await rpcCall("eth_getTransactionByHash", [hash]);
  return result as Transaction;
}

export async function getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
  const result = await rpcCall("eth_getTransactionReceipt", [hash]);
  return result as TransactionReceipt;
}

export async function getBalance(address: string): Promise<string> {
  const result = await rpcCall("eth_getBalance", [address, "latest"]);
  return result as string;
}

export async function getTransactionCount(address: string): Promise<string> {
  const result = await rpcCall("eth_getTransactionCount", [address, "latest"]);
  return result as string;
}

export async function getCode(address: string): Promise<string> {
  const result = await rpcCall("eth_getCode", [address, "latest"]);
  return result as string;
}
