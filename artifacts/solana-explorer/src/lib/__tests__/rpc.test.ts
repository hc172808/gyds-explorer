import { afterEach, describe, expect, it, vi } from "vitest";
import { getExpectedChainId, getRpcEndpoints } from "../rpc";
import { saveRuntimeNodeSettings } from "../networkApi";
import {
  DEFAULT_PRIMARY_RPC,
  fixedRpcEndpoint,
  getSelectedNetworkConfig,
  NETWORK_CHAIN_IDS,
  setSelectedNetworkConfig,
} from "../networkConfig";

const originalNetwork = getSelectedNetworkConfig();

afterEach(() => {
  vi.unstubAllGlobals();
  setSelectedNetworkConfig(originalNetwork);
});

describe("active network RPC configuration", () => {
  it("defaults the admin primary RPC to the requested Guardian Chain endpoint", () => {
    expect(DEFAULT_PRIMARY_RPC).toBe("https://app.netlifegy.com/api/rpc");
  });

  it("saves changed RPC URLs through the authenticated server settings endpoint", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "test-admin-token" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const settings = {
      primaryRpc: "https://app.netlifegy.com/api/rpc",
      boostnodeRpc: "https://rpc2.netlifegy.com",
      bootnodeEnode: "",
    };
    expect(await saveRuntimeNodeSettings(settings)).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/nodes/runtime-settings", {
      method: "PUT",
      headers: { Authorization: "Bearer test-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  });

  it("does not report a save as successful when the API rejects it", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Admin authorization required" }), { status: 403 })));
    await expect(saveRuntimeNodeSettings({ primaryRpc: DEFAULT_PRIMARY_RPC, boostnodeRpc: "https://rpc2.netlifegy.com", bootnodeEnode: "" }))
      .rejects.toThrow("Admin authorization required");
  });

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
