import {
  getBlock,
  getTransaction,
  getTransactionReceipt,
  getBalance,
  getCode,
  getTransactionCount,
  hexToNumber,
  rpcCall,
} from "./rpc";
import { Block, Transaction } from "./types";

export type SearchResultType = "block" | "transaction" | "address";

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface SearchResolution {
  query: string;
  results: SearchResultItem[];
  /** Rows related to the primary match, rendered as a paginated table. */
  related: RelatedRow[];
  relatedLabel: string;
  error?: string;
}

export interface RelatedRow {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string;
  href: string;
}

const isHash = (q: string) => /^0x[0-9a-fA-F]{64}$/.test(q);
const isAddress = (q: string) => /^0x[0-9a-fA-F]{40}$/.test(q);
const isNumber = (q: string) => /^\d+$/.test(q);

function txToRow(tx: Transaction): RelatedRow {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    blockNumber: tx.blockNumber,
    href: `/tx/${tx.hash}`,
  };
}

function blockTxRows(block: Block): RelatedRow[] {
  if (!Array.isArray(block.transactions)) return [];
  return block.transactions
    .filter((t): t is Transaction => typeof t === "object" && t !== null)
    .map(txToRow);
}

/** Scans the most recent `depth` blocks for transactions touching `address`. */
async function findAddressTxs(address: string, depth = 30): Promise<RelatedRow[]> {
  const latest = hexToNumber((await rpcCall("eth_blockNumber")) as string);
  const target = address.toLowerCase();
  const numbers = Array.from({ length: depth }, (_, i) => latest - i).filter((n) => n >= 0);
  const blocks = await Promise.all(
    numbers.map((n) => getBlock("0x" + n.toString(16), true).catch(() => null)),
  );
  return blocks
    .filter((b): b is Block => !!b)
    .flatMap(blockTxRows)
    .filter(
      (row) => row.from?.toLowerCase() === target || row.to?.toLowerCase() === target,
    );
}

export async function resolveSearch(rawQuery: string): Promise<SearchResolution> {
  const query = rawQuery.trim();
  const empty: SearchResolution = { query, results: [], related: [], relatedLabel: "" };
  if (!query) return { ...empty, error: "Enter a block number, transaction hash, or address." };

  if (isNumber(query)) {
    const block = await getBlock("0x" + parseInt(query, 10).toString(16), true).catch(() => null);
    if (!block) return { ...empty, error: `No block found at height ${query}.` };
    const rows = blockTxRows(block);
    return {
      query,
      results: [
        {
          type: "block",
          id: block.hash,
          title: `Block #${hexToNumber(block.number).toLocaleString()}`,
          subtitle: `${rows.length} transactions · ${block.hash}`,
          href: `/block/${hexToNumber(block.number)}`,
        },
      ],
      related: rows,
      relatedLabel: "Transactions in this block",
    };
  }

  if (isAddress(query)) {
    const [balance, code, nonce] = await Promise.all([
      getBalance(query).catch(() => "0x0"),
      getCode(query).catch(() => "0x"),
      getTransactionCount(query).catch(() => "0x0"),
    ]);
    const isContract = !!code && code !== "0x";
    const related = await findAddressTxs(query).catch(() => []);
    return {
      query,
      results: [
        {
          type: "address",
          id: query,
          title: isContract ? "Contract" : "Address",
          subtitle: `${query} · ${hexToNumber(nonce)} txs sent · balance ${BigInt(balance).toString()} wei`,
          href: `/address/${query}`,
        },
      ],
      related,
      relatedLabel: "Recent transactions involving this address",
    };
  }

  if (isHash(query)) {
    const [tx, block] = await Promise.all([
      getTransaction(query).catch(() => null),
      getBlock(query, true).catch(() => null),
    ]);
    const results: SearchResultItem[] = [];
    let related: RelatedRow[] = [];
    let relatedLabel = "";

    if (tx) {
      const receipt = await getTransactionReceipt(query).catch(() => null);
      results.push({
        type: "transaction",
        id: tx.hash,
        title: "Transaction",
        subtitle: `${receipt ? (receipt.status === "0x1" ? "Success" : "Failed") : "Pending"} · block ${
          tx.blockNumber ? hexToNumber(tx.blockNumber).toLocaleString() : "pending"
        }`,
        href: `/tx/${tx.hash}`,
      });
      related = [txToRow(tx)];
      relatedLabel = "Matched transaction";
    }
    if (block) {
      results.push({
        type: "block",
        id: block.hash,
        title: `Block #${hexToNumber(block.number).toLocaleString()}`,
        subtitle: block.hash,
        href: `/block/${hexToNumber(block.number)}`,
      });
      const rows = blockTxRows(block);
      if (rows.length) {
        related = rows;
        relatedLabel = "Transactions in this block";
      }
    }
    if (!results.length) return { ...empty, error: "No block or transaction matches that hash." };
    return { query, results, related, relatedLabel };
  }

  return { ...empty, error: "Unrecognized input. Use a block number, 66-char hash, or 42-char address." };
}
