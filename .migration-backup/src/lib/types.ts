export interface Block {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  transactions: string[] | Transaction[];
  size: string;
  difficulty: string;
  totalDifficulty: string;
  extraData: string;
  baseFeePerGas?: string;
  nonce: string;
}

export interface Transaction {
  hash: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  input: string;
  nonce: string;
  transactionIndex: string;
  type?: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  gasUsed: string;
  cumulativeGasUsed: string;
  contractAddress: string | null;
  status: string;
  logs: Log[];
}

export interface Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export interface NetworkStats {
  blockNumber: number;
  gasPrice: string;
  chainId: number;
  peerCount: number;
}
