/**
 * Native coin configuration for the GYDS network.
 * 
 * GYDS - Primary native coin (18 decimals)
 * GYD  - Stablecoin (6 decimals)
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

/**
 * Format a raw value (hex or decimal string) to a human-readable coin amount.
 */
export function formatCoinAmount(rawValue: string, coin: NativeCoin): string {
  try {
    const val = BigInt(rawValue);
    const divisor = BigInt(10 ** coin.decimals);
    const whole = val / divisor;
    const remainder = val % divisor;
    const decimals = remainder.toString().padStart(coin.decimals, "0");
    
    // Trim trailing zeros but keep at least 2 decimal places for stablecoins
    const minDecimals = coin.isStablecoin ? 2 : 6;
    let trimmed = decimals.replace(/0+$/, "");
    if (trimmed.length < minDecimals) {
      trimmed = decimals.slice(0, minDecimals);
    }
    
    return `${whole}.${trimmed}`;
  } catch {
    return "0";
  }
}

/**
 * Format wei (18 decimals) to GYDS amount
 */
export function weiToGyds(wei: string): string {
  return formatCoinAmount(wei, GYDS_COIN);
}

/**
 * Format raw value (6 decimals) to GYD amount
 */
export function rawToGyd(raw: string): string {
  return formatCoinAmount(raw, GYD_COIN);
}
