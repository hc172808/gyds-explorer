import { describe, expect, it } from "vitest";
import { formatDeployError, getTokenDeploymentNetworkError } from "../useTokenDeploy";

describe("getTokenDeploymentNetworkError", () => {
  it("keeps GYD on Mainnet even when deployment is invoked outside the admin form", () => {
    expect(getTokenDeploymentNetworkError("GYD", "testnet", 198281))
      .toBe("GYD can only be deployed on GYDS Mainnet.");
    expect(getTokenDeploymentNetworkError("GYD", "mainnet", 198282)).toBeNull();
  });

  it("keeps the test token on Testnet", () => {
    expect(getTokenDeploymentNetworkError("TGYD", "mainnet", 198282))
      .toBe("TGYD can only be deployed on GYDS Testnet.");
    expect(getTokenDeploymentNetworkError("TGYD", "testnet", 198281)).toBeNull();
  });

  it("does not constrain unrelated token symbols", () => {
    expect(getTokenDeploymentNetworkError("DEMO", "custom", null)).toBeNull();
  });
});

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
