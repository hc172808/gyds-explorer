package blockchain

import (
	"math/big"
	"sync"
	"testing"
)

// GYDS must be 18 decimals everywhere.
func TestGYDSDecimals(t *testing.T) {
	one := new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)
	if BlockReward.Cmp(new(big.Int).Mul(big.NewInt(2), one)) != 0 {
		t.Fatalf("block reward should be 2 GYDS in 18-decimal wei, got %s", BlockReward)
	}
}

// Reads must not mutate the account map (regression: concurrent map write).
func TestStateDBConcurrentReadsAndWrites(t *testing.T) {
	s := NewStateDB()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func() { defer wg.Done(); s.GetGYDSBalance("0xabc"); s.GetAccount("0xdef"); s.GetNonce("0xghi") }()
		go func() { defer wg.Done(); s.AddGYDSBalance("0xabc", big.NewInt(1)) }()
	}
	wg.Wait()
	if got := s.GetGYDSBalance("0xabc"); got.Cmp(big.NewInt(50)) != 0 {
		t.Fatalf("expected 50, got %s", got)
	}
	if len(s.AllAccounts()) != 1 {
		t.Fatalf("read-only access created accounts: %v", s.AllAccounts())
	}
}

// A header hash must be reproducible by any node receiving the block.
func TestBlockHashIsReproducible(t *testing.T) {
	h := Header{Number: 7, ParentHash: "0x1", Timestamp: 1000, Miner: "0x2", Difficulty: big.NewInt(3)}
	h.Hash = computeBlockHash(h)
	if computeBlockHash(h) != h.Hash {
		t.Fatal("hash changes once Hash field is populated")
	}
}

func TestComputeTxRootIsOrderSensitiveAndStable(t *testing.T) {
	a := []*Transaction{{Hash: "0xa"}, {Hash: "0xb"}, {Hash: "0xc"}}
	b := []*Transaction{{Hash: "0xc"}, {Hash: "0xb"}, {Hash: "0xa"}}
	if computeTxRoot(a) != computeTxRoot(a) {
		t.Fatal("tx root is not deterministic")
	}
	if computeTxRoot(a) == computeTxRoot(b) {
		t.Fatal("tx root ignores transaction order")
	}
	if computeTxRoot(nil) != "0x0000000000000000000000000000000000000000000000000000000000000000" {
		t.Fatal("empty tx root should be zero hash")
	}
}
