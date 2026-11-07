package blockchain

import (
	"math/big"
	"testing"
)

func TestGYDSDenomination(t *testing.T) {
	if GYDSDecimals != 18 || GYDSBaseUnits().String() != "1000000000000000000" {
		t.Fatal("GYDS must use 18 decimals and 10^18 base units")
	}
	GYDSBaseUnits().SetInt64(9)
	if GYDSBaseUnits().String() != "1000000000000000000" {
		t.Fatal("caller mutated the shared GYDS denomination")
	}
}

func TestGYDDenomination(t *testing.T) {
	if GYDDecimals != 6 || GYDBaseUnits().String() != "1000000" {
		t.Fatal("GYD must use 6 decimals and 10^6 base units")
	}
}

func TestGenesisDualCoinBaseUnits(t *testing.T) {
	chain := &Blockchain{state: NewStateDB()}
	chain.createGenesis()
	address := "0x0000000000000000000000000000000000000001"
	if got := chain.state.GetGYDSBalance(address).String(); got != "1000000000000000000000000000" {
		t.Fatalf("one billion GYDS must use 18 decimals, got %s", got)
	}
	if got := chain.state.GetGYDBalance(address).String(); got != "1000000000000000" {
		t.Fatalf("one billion GYD must use 6 decimals, got %s", got)
	}
}

func TestTransfersPreserveEachCoinBaseUnits(t *testing.T) {
	for _, coin := range []CoinType{CoinGYDS, CoinGYD} {
		t.Run(string(coin), func(t *testing.T) {
			state := NewStateDB()
			from := "0x0000000000000000000000000000000000000001"
			to := "0x0000000000000000000000000000000000000002"
			amount := GYDSBaseUnits()
			if coin == CoinGYD {
				amount = GYDBaseUnits()
			}
			state.SetGYDSBalance(from, new(big.Int).Mul(big.NewInt(2), GYDSBaseUnits()))
			state.SetGYDBalance(from, new(big.Int).Mul(big.NewInt(2), GYDBaseUnits()))
			tx := &Transaction{From: from, To: to, Value: amount.String(), CoinType: coin, GasPrice: 1, GasLimit: 21000, Signature: "test"}
			tx.Hash = ComputeTxHash(tx)
			if err := ValidateTransaction(tx, state); err != nil {
				t.Fatal(err)
			}
			chain := &Blockchain{state: state}
			if err := chain.applyTransaction(tx, ""); err != nil {
				t.Fatal(err)
			}
			got := state.GetGYDSBalance(to)
			if coin == CoinGYD {
				got = state.GetGYDBalance(to)
			}
			if got.Cmp(amount) != 0 {
				t.Fatalf("wrong transfer base units: got %s, want %s", got, amount)
			}
			wantGasBalance := new(big.Int).Sub(new(big.Int).Mul(big.NewInt(2), GYDSBaseUnits()), big.NewInt(21000))
			if coin == CoinGYDS {
				wantGasBalance.Sub(wantGasBalance, amount)
			}
			if state.GetGYDSBalance(from).Cmp(wantGasBalance) != 0 {
				t.Fatal("gas must be charged in GYDS base units")
			}
			restored := NewStateDB()
			restored.RestoreFromSnapshot(state.CreateSnapshot())
			if restored.GetGYDSBalance(from).Cmp(state.GetGYDSBalance(from)) != 0 || restored.GetGYDBalance(to).Cmp(state.GetGYDBalance(to)) != 0 {
				t.Fatal("snapshot changed coin units")
			}
		})
	}
}
