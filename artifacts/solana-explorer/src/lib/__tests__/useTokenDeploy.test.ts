import { describe, expect, it } from "vitest";
import { formatDeployError } from "../useTokenDeploy";

describe("formatDeployError", () => {
  it("explains that insufficient funds means native gas funds are needed", () => {
    expect(
      formatDeployError(
        new Error("insufficient funds for gas * price + value"),
        "GYDS Testnet",
        198281,
      ),
    ).toContain("native GYDS to pay deployment fees on GYDS Testnet (chain ID 198281)");
  });

  it("preserves unrelated deployment errors", () => {
    expect(formatDeployError(new Error("User rejected the request"), "GYDS Mainnet", 198282))
      .toBe("User rejected the request");
  });
});
