import { describe, expect, it } from "vitest";
import { getWalletError } from "../wallet";
import { NETWORK_CHAIN_IDS } from "../networkConfig";

describe("wallet network errors", () => {
  it("explains when a Mainnet wallet action reaches the private Testnet RPC", () => {
    const error = new Error(
      `Wrong RPC chain ID: expected ${NETWORK_CHAIN_IDS.mainnet}, but the endpoint reports ${NETWORK_CHAIN_IDS.testnet}.`,
    );

    expect(getWalletError(error)).toContain("Select Testnet in the explorer’s network menu");
    expect(getWalletError(error)).toContain("Mainnet needs its own chain ID 198282 RPC");
  });

  it("preserves unrelated wallet errors", () => {
    expect(getWalletError(new Error("The request was rejected in your wallet.")))
      .toBe("The request was rejected in your wallet.");
  });
});
