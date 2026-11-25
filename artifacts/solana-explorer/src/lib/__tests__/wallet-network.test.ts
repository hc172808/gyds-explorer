import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWalletNetworkConfig,
  getRpcUrls,
  switchToGydsNetwork,
  type EthereumProvider,
} from "../wallet";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("private Testnet wallet setup", () => {
  it("builds the private Testnet network with TGYDS as its native coin", () => {
    const network = createWalletNetworkConfig("testnet", 198281n);

    expect(network).toMatchObject({
      chainId: "0x30689",
      chainName: "GYDS Private Testnet",
      nativeCurrency: { name: "TGYDS", symbol: "TGYDS", decimals: 18 },
    });
  });

  it("turns same-origin RPC paths into absolute wallet URLs", () => {
    expect(getRpcUrls("/api/rpc?network=testnet"))
      .toEqual(["http://localhost/api/rpc?network=testnet"]);
  });

  it("validates and adds the Testnet with absolute RPC details before switching", async () => {
    const rpcUrl = "https://explorer.example/api/rpc?network=testnet";
    let added = false;
    const provider: EthereumProvider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain") {
          if (!added) throw Object.assign(new Error("Unknown chain"), { code: 4902 });
          return null;
        }
        if (method === "wallet_addEthereumChain") {
          added = true;
          return null;
        }
        throw new Error(`Unexpected wallet method: ${method}`);
      }),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x30689" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await switchToGydsNetwork(provider, [rpcUrl], "testnet");

    const addCall = vi.mocked(provider.request).mock.calls.find(([request]) => request.method === "wallet_addEthereumChain");
    expect(addCall?.[0].params?.[0]).toMatchObject({
      chainId: "0x30689",
      chainName: "GYDS Private Testnet",
      rpcUrls: [rpcUrl],
      nativeCurrency: { name: "TGYDS", symbol: "TGYDS", decimals: 18 },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
