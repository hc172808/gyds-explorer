package networkconfig

import (
	"fmt"
	"testing"
)

func TestParseSupportedNetworks(t *testing.T) {
	tests := []struct {
		name string
		want Config
	}{
		{name: "mainnet", want: Config{Name: Mainnet, ChainID: 198282}},
		{name: "testnet", want: Config{Name: Testnet, ChainID: 198281}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := Parse(test.name)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("Parse(%q) = %+v, want %+v", test.name, got, test.want)
			}
			wantHex := "0x3068a"
			if test.name == "testnet" {
				wantHex = "0x30689"
			}
			if gotHex := fmt.Sprintf("0x%x", got.ChainID); gotHex != wantHex {
				t.Fatalf("chain ID hex = %s, want %s", gotHex, wantHex)
			}
			fromID, err := FromChainID(got.ChainID)
			if err != nil || fromID != got {
				t.Fatalf("FromChainID(%d) = %+v, %v; want %+v", got.ChainID, fromID, err, got)
			}
		})
	}
}

func TestRejectsUnsupportedNetworkIdentity(t *testing.T) {
	if _, err := Parse(""); err == nil {
		t.Fatal("empty network name must be rejected")
	}
	if _, err := Parse("production"); err == nil {
		t.Fatal("unknown network name must be rejected")
	}
	if _, err := FromChainID(1); err == nil {
		t.Fatal("unknown chain ID must be rejected")
	}
}
