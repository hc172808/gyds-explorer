import { API_BASE_URL, getStoredToken, setStoredToken, clearStoredToken } from "@/lib/featureGateApi";
import { getEthereumProvider } from "@/lib/wallet";

export interface WalletSession {
  walletAddress: string;
  label: string | null;
  role: "admin" | "user";
}

const SESSION_KEY = "gyds-session";

export function getStoredSession(): WalletSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw || !getStoredToken()) return null;
    return JSON.parse(raw) as WalletSession;
  } catch {
    return null;
  }
}

export function storeSession(session: WalletSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  clearStoredToken();
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Sign-in service unreachable at ${API_BASE_URL}.`);
  }
  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    try {
      const parsed = (await res.json()) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/** Full connect → nonce → sign → verify flow. Works for admins and regular users. */
export async function signInWithWallet(): Promise<WalletSession> {
  const ethereum = getEthereumProvider();
  if (!ethereum) throw new Error("No browser wallet detected. Install MetaMask or another Web3 wallet.");

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("The wallet did not return a valid address.");

  const { message } = await post<{ nonce: string; message: string }>("/auth/session/nonce", { walletAddress: address });
  const signature = (await ethereum.request({ method: "personal_sign", params: [message, address] })) as string;

  const result = await post<{ token: string; walletAddress: string; label: string | null; role: "admin" | "user" }>(
    "/auth/session/verify",
    { walletAddress: address, signature },
  );

  setStoredToken(result.token);
  const session: WalletSession = { walletAddress: result.walletAddress, label: result.label, role: result.role };
  storeSession(session);
  return session;
}

/** Where a wallet should land right after signing in. */
export function dashboardPathFor(session: WalletSession): string {
  return session.role === "admin" ? "/admin" : "/dashboard";
}
