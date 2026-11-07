import type { AutoUpdateSettings, AutoUpdateSettingsInput } from "@workspace/api-client-react";
import { API_BASE_URL } from "@/lib/apiBase";
import { getStoredToken } from "@/lib/featureGateApi";

export type { AutoUpdateSettings };

async function request<T>(method: "GET" | "PUT", body?: AutoUpdateSettingsInput): Promise<T> {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE_URL}/system/auto-update`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    let message = `Request failed (HTTP ${response.status})`;
    try {
      const payload = await response.json() as { error?: string };
      message = payload.error || message;
    } catch {
      // Keep the HTTP status message when the server did not return JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchAutoUpdateSettings(): Promise<AutoUpdateSettings> {
  return request<AutoUpdateSettings>("GET");
}

export function saveAutoUpdateSettings(enabled: boolean): Promise<AutoUpdateSettings> {
  return request<AutoUpdateSettings>("PUT", { enabled });
}
