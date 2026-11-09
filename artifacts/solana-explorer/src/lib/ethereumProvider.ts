export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: EthereumProvider[];
}

function injectedEthereumProviders(): EthereumProvider[] {
  const walletWindow = window as Window & {
    ethereum?: EthereumProvider;
    phantom?: { ethereum?: EthereumProvider };
    trustwallet?: { ethereum?: EthereumProvider };
    trustWallet?: { ethereum?: EthereumProvider };
  };
  const ethereum = walletWindow.ethereum;
  return [
    ...(Array.isArray(ethereum?.providers) ? ethereum.providers : []),
    ethereum,
    walletWindow.phantom?.ethereum,
    walletWindow.trustwallet?.ethereum,
    walletWindow.trustWallet?.ethereum,
  ].filter((provider): provider is EthereumProvider => Boolean(provider));
}

export function getEthereumProvider(): EthereumProvider | null {
  const candidates = [...new Set(injectedEthereumProviders())];
  return candidates.find((provider) => provider.isMetaMask)
    ?? candidates.find((provider) => provider.isPhantom)
    ?? candidates.find((provider) => provider.isTrust || provider.isTrustWallet)
    ?? candidates[0]
    ?? null;
}

/** Find the injected wallet that currently exposes the requested account. */
export async function getEthereumProviderForAccount(accountAddress: string): Promise<EthereumProvider | null> {
  const candidates = new Set(injectedEthereumProviders());
  const announcements: EthereumProvider[] = [];
  const handleAnnouncement = (event: Event) => {
    const provider = (event as CustomEvent<{ provider?: EthereumProvider }>).detail?.provider;
    if (provider) announcements.push(provider);
  };

  window.addEventListener("eip6963:announceProvider", handleAnnouncement);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 200));
  window.removeEventListener("eip6963:announceProvider", handleAnnouncement);
  announcements.forEach((provider) => candidates.add(provider));

  for (const provider of candidates) {
    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      if (
        Array.isArray(accounts) &&
        accounts.some((account) => typeof account === "string" && account.toLowerCase() === accountAddress.toLowerCase())
      ) {
        return provider;
      }
    } catch {
      // A locked or disconnected wallet cannot sign this action.
    }
  }
  return null;
}
