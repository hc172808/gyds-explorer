import { afterEach, describe, expect, it } from "vitest";
import { getExpectedChainId, getRpcEndpoints } from "../rpc";
import {
  fixedRpcEndpoint,
  getSelectedNetworkConfig,
  NETWORK_CHAIN_IDS,
  setSelectedNetworkConfig,
} from "../networkConfig";

const originalNetwork = getSelectedNetworkConfig();

afterEach(() => {
  setSelectedNetworkConfig(originalNetwork);
});

describe("active network RPC configuration", () => {
  it("uses the mainnet proxy and chain ID when mainnet is selected", () => {
    setSelectedNetworkConfig({
      type: "mainnet",
      name: "Mainnet",
      rpcEndpoints: [fixedRpcEndpoint("mainnet")],
      chainId: NETWORK_CHAIN_IDS.mainnet,
    });

    expect(getRpcEndpoints()).toEqual(["/api/rpc?network=mainnet"]);
    expect(getExpectedChainId()).toBe(198282);
  });

  it("accepts the reported chain ID for an admin-configured mainnet RPC", () => {
    setSelectedNetworkConfig({
      type: "custom",
      name: "Custom Mainnet RPC",
      rpcEndpoints: ["https://rpc.example.invalid"],
      chainId: null,
      customRpcUrl: "https://rpc.example.invalid",
    });

    expect(getRpcEndpoints()).toEqual(["https://rpc.example.invalid"]);
    expect(getExpectedChainId()).toBeNull();
  });
});
