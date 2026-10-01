import { describe, it, expect } from "vitest";
import { formatUnits, parseUnits } from "ethers";
import {
  GYDS_COIN,
  GYD_COIN,
  formatUnitsRaw,
  formatCoinAmount,
  parseCoinAmount,
  weiToGyds,
  rawToGyd,
  gydsToWei,
  gydToRaw,
} from "../coins";

describe("coin decimals config", () => {
  it("GYDS uses 9 decimals and GYD uses 6", () => {
    expect(GYDS_COIN.decimals).toBe(9);
    expect(GYD_COIN.decimals).toBe(6);
  });
});

describe("weiToGyds (9 decimals)", () => {
  it("formats one whole GYDS", () => {
    expect(weiToGyds("1000000000")).toBe("1");
  });

  it("formats fractional GYDS", () => {
    expect(weiToGyds("1500000000")).toBe("1.5");
    expect(weiToGyds("123456789")).toBe("0.123456");
  });

  it("does not treat GYDS as 18 decimals (regression)", () => {
    expect(weiToGyds("1000000000")).not.toBe("0.000000001");
    expect(weiToGyds("1000000000")).toBe("1");
  });

  it("keeps full precision for very large balances", () => {
    const raw = "123456789012345678901234567890";
    expect(weiToGyds(raw)).toBe("123456789012345678901.234567");
  });

  it("accepts hex values", () => {
    expect(weiToGyds("0x3b9aca00")).toBe("1");
  });

  it("matches ethers formatUnits truncated to 6 digits", () => {
    const samples = ["1", "999", "1000000001", "31415926535897932384"];
    for (const s of samples) {
      const ethersOut = formatUnits(s, 9);
      const [i, f = ""] = ethersOut.split(".");
      const expected = (f.slice(0, 6).replace(/0+$/, "") ? `${i}.${f.slice(0, 6).replace(/0+$/, "")}` : i);
      expect(weiToGyds(s)).toBe(expected);
    }
  });
});

describe("rawToGyd (6 decimals)", () => {
  it("formats stablecoin amounts with 2 minimum fraction digits", () => {
    expect(rawToGyd("1000000")).toBe("1.00");
    expect(rawToGyd("1234567")).toBe("1.234567");
  });
});

describe("parse helpers", () => {
  it("gydsToWei round-trips with ethers parseUnits", () => {
    expect(gydsToWei("1")).toBe(parseUnits("1", 9));
    expect(gydsToWei("0.000000001")).toBe(1n);
    expect(gydsToWei("12.345")).toBe(parseUnits("12.345", 9));
  });

  it("gydToRaw uses 6 decimals", () => {
    expect(gydToRaw("1")).toBe(1000000n);
    expect(gydToRaw("0.000001")).toBe(1n);
  });

  it("rejects too many decimals", () => {
    expect(() => gydToRaw("0.0000001")).toThrow();
    expect(() => parseCoinAmount("abc", GYDS_COIN)).toThrow();
  });
});

describe("formatUnitsRaw options", () => {
  it("supports grouping and negative values", () => {
    expect(formatUnitsRaw("1234567000000000", 9, { grouping: true })).toBe("1,234,567");
    expect(formatUnitsRaw(-1500000000n, 9)).toBe("-1.5");
  });

  it("truncates instead of rounding up", () => {
    expect(formatUnitsRaw("1999999999", 9, { maxFractionDigits: 2 })).toBe("1.99");
  });

  it("returns 0 for invalid input", () => {
    expect(formatCoinAmount("not-a-number", GYDS_COIN)).toBe("0");
  });
});
