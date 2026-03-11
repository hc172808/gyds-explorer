import { Block, Transaction, TransactionReceipt, NetworkStats } from "./types";

const RPC_ENDPOINTS = [
  "https://rpc.netlifegy.com",
  "https://rpc2.netlifegy.com",
];

let currentEndpoint = 0;

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const maxRetries = RPC_ENDPOINTS.length;
  for (let i = 0; i < maxRetries; i++) {
    const url = RPC_ENDPOINTS[(currentEndpoint + i) % RPC_ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      currentEndpoint = (currentEndpoint + 1) % RPC_ENDPOINTS.length;
    }
  }
}

export const hexToNumber = (hex: string): number => parseInt(hex, 16);
export const hexToDecimal = (hex: string): string => BigInt(hex).toString();
export const weiToEther = (wei: string): string => {
  const val = BigInt(wei);
  const eth = Number(val) / 1e18;
  return eth.toFixed(6);
};
export const gweiFromWei = (wei: string): string => {
  return (Number(BigInt(wei)) / 1e9).toFixed(2);
};

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
