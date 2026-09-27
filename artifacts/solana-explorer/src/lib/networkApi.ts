import { getStoredToken } from "./featureGateApi";

const RAW_BASE = (import.meta.env.VITE_FEATURE_GATE_URL as string | undefined)?.trim() || "/api";
export const API_BASE = RAW_BASE.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";

export type NetworkNodeType = "main" | "full" | "lite" | "rpc" | "boost" | "validator" | "boot";

export interface NetworkNode {
  id: number;
  name: string;
  type: NetworkNodeType;
  rpcUrl: string;
  /** Present only in authenticated admin responses. */
  enode?: string | null;
  status: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CoinSetting {
  symbol: string;
  name: string;
  decimals: number;
  contractAddress: string | null;
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
  try {
    const response = await fetch(`${API_BASE}/nodes/ping`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rpcUrl }),
      signal: AbortSignal.timeout(6000),
    });
    const result = await response.json() as { ok?: boolean; blockNumber?: number; chainId?: number; error?: string };
    if (!response.ok) return { ok: false, error: result.error || `HTTP ${response.status}` };
    return { ok: Boolean(result.ok), blockNumber: result.blockNumber, chainId: result.chainId, error: result.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "RPC unreachable" };
  }
}

export async function saveRuntimeNodeSettings(input: {
  primaryRpc: string;
  boostnodeRpc: string;
  bootnodeEnode: string;
}) {
  const response = await fetch(`${API_BASE}/nodes/runtime-settings`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response, "Failed to save runtime node settings"));
  return response.json() as Promise<{ success: boolean }>;
}

export function proxyRpcUrl(nodeId?: number): string {
  return nodeId ? `${API_BASE}/rpc?nodeId=${nodeId}` : `${API_BASE}/rpc`;
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