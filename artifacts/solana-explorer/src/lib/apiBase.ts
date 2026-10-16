type ApiBaseEnv = ImportMetaEnv & {
  VITE_API_BASE_URL?: string;
  VITE_FEATURE_GATE_URL?: string;
};

const env = import.meta.env as ApiBaseEnv;

export function normalizeApiBaseUrl(value?: string | null): string {
  const raw = value?.trim() || "/api";
  const withoutTrailingSlashes = raw.replace(/\/+$/, "");
  const withoutApiSuffix = withoutTrailingSlashes.replace(/\/api$/i, "");
  return `${withoutApiSuffix}/api`;
}

// VITE_FEATURE_GATE_URL is retained as a backwards-compatible alias.
export const API_BASE_URL = normalizeApiBaseUrl(
  env.VITE_API_BASE_URL?.trim() || env.VITE_FEATURE_GATE_URL?.trim() || "/api",
);
