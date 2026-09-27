/**
 * Native coin configuration for the GYDS network.
 *
 * GYDS - Primary native coin (18 decimals)
 * GYD  - Stablecoin (6 decimals)
 *
 * All formatting here is BigInt-based: raw on-chain values are never converted
 * through JS `number`, so 18-decimal values keep full precision.
 */

export interface NativeCoin {
  symbol: string;
  name: string;
  decimals: number;
  isStablecoin: boolean;
  description: string;
}

export const GYDS_COIN: NativeCoin = {
  symbol: "GYDS",
  name: "GYDS",
  decimals: 18,
  isStablecoin: false,
  description: "Native coin of the GYDS network",
};

export const GYD_COIN: NativeCoin = {
  symbol: "GYD",
  name: "GYD",
  decimals: 6,
  isStablecoin: true,
  description: "Stablecoin of the GYDS network",
};

export const NATIVE_COINS = [GYDS_COIN, GYD_COIN] as const;

/** Parse hex ("0x..") or decimal strings / bigints into a BigInt. */
export function toBigInt(rawValue: string | bigint | number): bigint {
  if (typeof rawValue === "bigint") return rawValue;
  if (typeof rawValue === "number") return BigInt(Math.trunc(rawValue));
  const v = rawValue.trim();
  if (v === "") return 0n;
  return BigInt(v);
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface FormatOptions {
  /** Maximum fraction digits rendered (default 6). */
  maxFractionDigits?: number;
  /** Minimum fraction digits rendered (default 0). */
  minFractionDigits?: number;
  /** Insert thousands separators in the integer part (default false). */
  grouping?: boolean;
}

/**
 * Decimals-aware formatter for raw on-chain integer values.
 * Truncates (never rounds up) so displayed balances are never overstated.
 */
export function formatUnitsRaw(
  rawValue: string | bigint | number,
  decimals: number,
  options: FormatOptions = {},
): string {
  const { maxFractionDigits = 6, minFractionDigits = 0, grouping = false } = options;
  let val: bigint;
  try {
    val = toBigInt(rawValue);
  } catch {
    return "0";
  }

  const negative = val < 0n;
  if (negative) val = -val;

  const divisor = 10n ** BigInt(decimals);
  const whole = val / divisor;
  const remainder = val % divisor;

  let fraction = decimals > 0 ? remainder.toString().padStart(decimals, "0") : "";
  fraction = fraction.slice(0, Math.max(0, Math.min(maxFractionDigits, decimals)));
  fraction = fraction.replace(/0+$/, "");
  while (fraction.length < Math.min(minFractionDigits, decimals)) fraction += "0";

  const intPart = grouping ? groupThousands(whole.toString()) : whole.toString();
  const sign = negative ? "-" : "";
  return fraction ? `${sign}${intPart}.${fraction}` : `${sign}${intPart}`;
}

/**
 * Format a raw value (hex or decimal string) to a human-readable coin amount.
 * Stablecoins keep 2 fraction digits minimum, native coins up to 6.
 */
export function formatCoinAmount(
  rawValue: string | bigint,
  coin: NativeCoin,
  options: FormatOptions = {},
): string {
  return formatUnitsRaw(rawValue, coin.decimals, {
    minFractionDigits: coin.isStablecoin ? 2 : 0,
    maxFractionDigits: coin.isStablecoin ? 6 : 6,
    ...options,
  });
}

/** Convert a human-readable amount into raw base units for `coin`. */
export function parseCoinAmount(amount: string, coin: NativeCoin): bigint {
  const trimmed = amount.trim();
  if (!/^-?\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === "-") {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const negative = trimmed.startsWith("-");
  const [intPart, fracPart = ""] = trimmed.replace("-", "").split(".");
  if (fracPart.length > coin.decimals) {
    throw new Error(`${coin.symbol} supports at most ${coin.decimals} decimals`);
  }
  const padded = fracPart.padEnd(coin.decimals, "0");
  const raw = BigInt(`${intPart || "0"}${padded || ""}`);
  return negative ? -raw : raw;
}

/** Format raw GYDS units (18 decimals, wei) to a GYDS amount. */
export function weiToGyds(wei: string | bigint, options?: FormatOptions): string {
  return formatCoinAmount(wei, GYDS_COIN, options);
}

/** Format raw GYD units (6 decimals) to a GYD amount. */
export function rawToGyd(raw: string | bigint, options?: FormatOptions): string {
  return formatCoinAmount(raw, GYD_COIN, options);
}

/** Parse a human GYDS amount into wei (18 decimals). */
export function gydsToWei(amount: string): bigint {
  return parseCoinAmount(amount, GYDS_COIN);
}

/** Parse a human GYD amount into raw units (6 decimals). */
export function gydToRaw(amount: string): bigint {
  return parseCoinAmount(amount, GYD_COIN);
}
