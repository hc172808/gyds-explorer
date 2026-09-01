import { getStoredToken } from "./featureGateApi";
import { EXPECTED_CHAIN_ID } from "./rpc";

const RAW_BASE = (import.meta.env.VITE_FEATURE_GATE_URL as string | undefined)?.trim() || "/api";
export const API_BASE = RAW_BASE.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";

export type NetworkNodeType = "full" | "lite" | "boot";

export interface NetworkNode {
  id: number;
  name: string;
  type: NetworkNodeType;
  rpcUrl: string;
  enode: string | null;
  status: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CoinSetting {
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  description: string;
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function parseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchNetworkNodes(): Promise<NetworkNode[]> {
  const response = await fetch(`${API_BASE}/nodes`);
  if (!response.ok) throw new Error(await parseError(response, "Failed to load network nodes"));
  return response.json();
}

export async function fetchAdminNetworkNodes(): Promise<NetworkNode[]> {
  const response = await fetch(`${API_BASE}/nodes/admin`, { headers: authHeaders() });
  if (!response.ok) throw new Error(await parseError(response, "Failed to load network nodes"));
  return response.json();
}

export async function pingNetworkNode(rpcUrl: string): Promise<{ ok: boolean; blockNumber?: number; chainId?: number; latencyMs?: number; error?: string }> {
  const startedAt = Date.now();
  try {
    const request = (method: string) => fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const [chainResponse, blockResponse] = await Promise.all([
      request("eth_chainId"),
      request("eth_blockNumber"),
    ]);
    if (!chainResponse.ok) return { ok: false, error: `HTTP ${chainResponse.status}` };
    if (!blockResponse.ok) return { ok: false, error: `HTTP ${blockResponse.status}` };
    const chainJson = await chainResponse.json() as { result?: string; error?: { message?: string } };
    const blockJson = await blockResponse.json() as { result?: string; error?: { message?: string } };
    if (chainJson.error) return { ok: false, error: chainJson.error.message || "RPC chain ID error" };
    if (blockJson.error) return { ok: false, error: blockJson.error.message || "RPC block number error" };
    if (!chainJson.result) return { ok: false, error: "RPC returned no chain ID" };
    if (!blockJson.result) return { ok: false, error: "RPC returned no block number" };
    const chainId = Number.parseInt(chainJson.result, 16);
    if (chainId !== EXPECTED_CHAIN_ID) {
      return { ok: false, chainId, error: `Wrong chain ID: expected ${EXPECTED_CHAIN_ID}, received ${chainId}` };
    }
    return { ok: true, blockNumber: Number.parseInt(blockJson.result, 16), chainId, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "RPC unreachable" };
  }
}

export async function createNetworkNode(input: Omit<NetworkNode, "id" | "createdAt" | "updatedAt">) {
  const response = await fetch(`${API_BASE}/nodes`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to add node"));
  return response.json() as Promise<NetworkNode>;
}

export async function updateNetworkNode(id: number, input: Partial<Omit<NetworkNode, "id" | "createdAt" | "updatedAt">>) {
  const response = await fetch(`${API_BASE}/nodes/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to update node"));
  return response.json() as Promise<NetworkNode>;
}

export async function toggleNetworkNode(id: number, isActive: boolean) {
  const response = await fetch(`${API_BASE}/nodes/${id}/toggle`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ isActive }),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to update node connection"));
  return response.json() as Promise<NetworkNode>;
}

export async function deleteNetworkNode(id: number) {
  const response = await fetch(`${API_BASE}/nodes/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to remove node"));
}

export async function fetchCoinSettings(): Promise<CoinSetting[]> {
  const response = await fetch(`${API_BASE}/coin-settings`);
  if (!response.ok) throw new Error(await parseError(response, "Failed to load coin settings"));
  return response.json();
}

export async function updateCoinSetting(symbol: string, input: Omit<CoinSetting, "symbol">) {
  const response = await fetch(`${API_BASE}/coin-settings/${encodeURIComponent(symbol)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to save coin settings"));
  return response.json() as Promise<CoinSetting>;
}