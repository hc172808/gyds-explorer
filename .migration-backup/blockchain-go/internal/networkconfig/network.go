// Package networkconfig defines the network identities supported by the
// archived Guardian Go prototype. These are not Geth or Ethereum protocol
// compatibility guarantees.
package networkconfig

import "fmt"

type Name string

const (
	Mainnet Name = "mainnet"
	Testnet Name = "testnet"

	MainnetChainID uint64 = 198282
	TestnetChainID uint64 = 198281
)

type Config struct {
	Name    Name
	ChainID uint64
}

func Parse(name string) (Config, error) {
	switch Name(name) {
	case Mainnet:
		return Config{Name: Mainnet, ChainID: MainnetChainID}, nil
	case Testnet:
		return Config{Name: Testnet, ChainID: TestnetChainID}, nil
	default:
		return Config{}, fmt.Errorf("unsupported network %q: choose mainnet or testnet", name)
	}
}

func FromChainID(chainID uint64) (Config, error) {
	switch chainID {
	case MainnetChainID:
		return Config{Name: Mainnet, ChainID: MainnetChainID}, nil
	case TestnetChainID:
		return Config{Name: Testnet, ChainID: TestnetChainID}, nil
	default:
		return Config{}, fmt.Errorf("unsupported chain ID %d", chainID)
	}
}
