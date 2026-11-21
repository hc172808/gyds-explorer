package networkconfig

import "testing"

func TestParseSupportedNetworks(t *testing.T) {
	tests := []struct {
		name    string
		want    Config
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
