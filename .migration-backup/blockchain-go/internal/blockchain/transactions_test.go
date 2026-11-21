package blockchain

import (
	"math/big"
	"testing"
	"time"

	"github.com/guardian-chain/blockchain-go/internal/networkconfig"
	"github.com/guardian-chain/blockchain-go/internal/utils"
)

func signedTestTransaction(t *testing.T, chainID uint64) (*Transaction, *StateDB) {
	t.Helper()
	privateKey, err := utils.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	state := NewStateDB()
	from := utils.PubKeyToAddress(&privateKey.PublicKey)
	state.SetGYDSBalance(from, new(big.Int).Mul(big.NewInt(2), GYDSBaseUnits()))
	state.SetGYDBalance(from, new(big.Int).Mul(big.NewInt(2), GYDBaseUnits()))
	tx := &Transaction{
		To:        "0x0000000000000000000000000000000000000002",
		Value:     GYDSBaseUnits().String(),
		CoinType:  CoinGYDS,
		GasPrice:  1,
		GasLimit:  21000,
		Timestamp: time.Now().Unix(),
	}
	if err := SignTransaction(tx, privateKey, chainID); err != nil {
		t.Fatal(err)
	}
	return tx, state
}

func TestSignedTransactionIsBoundToChainID(t *testing.T) {
	tx, state := signedTestTransaction(t, networkconfig.MainnetChainID)
	if err := ValidateTransaction(tx, state, networkconfig.MainnetChainID); err != nil {
		t.Fatalf("valid Mainnet transaction rejected: %v", err)
	}
	if err := ValidateTransaction(tx, state, networkconfig.TestnetChainID); err == nil {
		t.Fatal("Mainnet transaction must not validate on Testnet")
	}
}

func TestTransactionPayloadTamperingInvalidatesSignature(t *testing.T) {
	tx, state := signedTestTransaction(t, networkconfig.MainnetChainID)
	tx.To = "0x0000000000000000000000000000000000000003"
	tx.Hash = ComputeTxHash(tx)
	if err := ValidateTransaction(tx, state, networkconfig.MainnetChainID); err == nil {
		t.Fatal("edited transaction must fail signature validation")
	}
}

func TestTransactionRejectsPlaceholderSignatureAndSenderMismatch(t *testing.T) {
	tx, state := signedTestTransaction(t, networkconfig.MainnetChainID)
	tx.Signature = "test"
	tx.Hash = ComputeTxHash(tx)
	if err := ValidateTransaction(tx, state, networkconfig.MainnetChainID); err == nil {
		t.Fatal("non-empty placeholder signature must not be accepted")
	}

	tx, state = signedTestTransaction(t, networkconfig.MainnetChainID)
	tx.From = "0x0000000000000000000000000000000000000001"
	tx.Hash = ComputeTxHash(tx)
	if err := ValidateTransaction(tx, state, networkconfig.MainnetChainID); err == nil {
		t.Fatal("sender that does not match the public key must be rejected")
	}
}

func TestSignTransactionRejectsSenderKeyMismatch(t *testing.T) {
	privateKey, err := utils.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	tx := &Transaction{
		From:      "0x0000000000000000000000000000000000000001",
		To:        "0x0000000000000000000000000000000000000002",
		Value:     "1",
		CoinType:  CoinGYDS,
		Timestamp: time.Now().Unix(),
	}
	if err := SignTransaction(tx, privateKey, networkconfig.MainnetChainID); err == nil {
		t.Fatal("signing a transaction for a different sender must fail")
	}
}
