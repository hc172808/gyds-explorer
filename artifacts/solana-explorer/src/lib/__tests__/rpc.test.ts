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

  it("updates the proxy route and chain ID when switching to testnet", () => {
    setSelectedNetworkConfig({
      type: "testnet",
      name: "Testnet",
      rpcEndpoints: [fixedRpcEndpoint("testnet")],
      chainId: NETWORK_CHAIN_IDS.testnet,
    });

    expect(getRpcEndpoints()).toEqual(["/api/rpc?network=testnet"]);
    expect(getExpectedChainId()).toBe(198281);
  });
});
