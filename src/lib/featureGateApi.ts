/**
 * Feature Gate API client
 * Handles communication with the Feature Gate Service
 */

const API_BASE = import.meta.env.VITE_FEATURE_GATE_URL || "http://localhost:3002";

const TOKEN_KEY = "gyds-admin-token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

// ─── Auth ─────────────────────────────────────────────────────────

export async function requestNonce(walletAddress: string): Promise<{ nonce: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to request nonce");
  }
  return res.json();
}

export async function verifySignature(walletAddress: string, signature: string): Promise<{ token: string; walletAddress: string; label: string }> {
  const res = await fetch(`${API_BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, signature }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Verification failed");
  }
  return res.json();
}

export async function getAdminInfo(): Promise<{ walletAddress: string; label: string; role: string } | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
    if (!res.ok) {
      clearStoredToken();
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

// ─── Feature Gates ────────────────────────────────────────────────

export interface FeatureGate {
  id: string;
  name: string;
  description: string;
  status: boolean;
  updated_at?: string;
}

export async function fetchFeatureGates(): Promise<FeatureGate[]> {
  const res = await fetch(`${API_BASE}/api/feature-gates`);
  if (!res.ok) throw new Error("Failed to fetch feature gates");
  return res.json();
}

export async function toggleFeatureGate(id: string, status: boolean): Promise<FeatureGate> {
  const res = await fetch(`${API_BASE}/api/feature-gates/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update feature gate");
  }
  return res.json();
}
