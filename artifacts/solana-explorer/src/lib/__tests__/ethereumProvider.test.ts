import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEthereumProvider,
  getEthereumProviderForAccount,
  type EthereumProvider,
} from "../ethereumProvider";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function installWalletWindow(ethereum: EthereumProvider) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      ethereum,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      setTimeout: (callback: () => void) => {
        callback();
        return 0;
      },
    },
  });
}

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("injected wallet provider selection", () => {
  it("prefers MetaMask, while supporting other injected EVM wallets", () => {
    const phantom: EthereumProvider = { request: vi.fn().mockResolvedValue([]), isPhantom: true };
    const metaMask: EthereumProvider = { request: vi.fn().mockResolvedValue([]), isMetaMask: true };
    installWalletWindow({
      request: vi.fn().mockResolvedValue([]),
      providers: [phantom, metaMask],
    });

    expect(getEthereumProvider()).toBe(metaMask);
  });

  it("selects the provider exposing the admin session account", async () => {
    const unrelated: EthereumProvider = {
      request: vi.fn().mockResolvedValue(["0x1111111111111111111111111111111111111111"]),
      isMetaMask: true,
    };
    const adminWallet: EthereumProvider = {
      request: vi.fn().mockResolvedValue(["0x2222222222222222222222222222222222222222"]),
      isPhantom: true,
    };
    installWalletWindow({
      request: vi.fn().mockResolvedValue([]),
      providers: [unrelated, adminWallet],
    });

    await expect(
      getEthereumProviderForAccount("0x2222222222222222222222222222222222222222"),
    ).resolves.toBe(adminWallet);
  });
});
