package blockchain

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/guardian-chain/blockchain-go/internal/utils"
)

// CoinType represents the asset type in a transaction
type CoinType string

const (
	CoinGYDS  CoinType = "GYDS"  // Native gas/staking coin, 18 decimals
	CoinGYD   CoinType = "GYD"   // Stablecoin, 6 decimals
	CoinStake CoinType = "STAKE" // Staking operation
)

// Transaction represents a blockchain transaction
type Transaction struct {
	Hash      string   `json:"hash"`
	From      string   `json:"from"`
	To        string   `json:"to"`
	Value     string   `json:"value"`    // Amount as string (big number)
	CoinType  CoinType `json:"coinType"` // GYDS, GYD, or STAKE
	Nonce     uint64   `json:"nonce"`
	GasPrice  uint64   `json:"gasPrice"`
	GasLimit  uint64   `json:"gasLimit"`
	Data      []byte   `json:"data,omitempty"` // Contract data (future use)
	Signature string   `json:"signature"`
	Timestamp int64    `json:"timestamp"`
}

// ComputeTxHash computes the hash for a transaction
func ComputeTxHash(tx *Transaction) string {
	data := fmt.Sprintf("%s:%s:%s:%s:%d:%d:%d",
		tx.From, tx.To, tx.Value, tx.CoinType, tx.Nonce, tx.GasPrice, tx.GasLimit)
	return utils.Keccak256Hex([]byte(data))
}

// ValidateTransaction checks a transaction's validity against current state
func ValidateTransaction(tx *Transaction, state *StateDB) error {
	// Validate addresses
	if tx.From == "" || tx.To == "" {
		return errors.New("missing from/to address")
	}
	if len(tx.From) != 42 || len(tx.To) != 42 {
		return errors.New("invalid address format")
	}

	// Validate value
	amount := new(big.Int)
	if _, ok := amount.SetString(tx.Value, 10); !ok {
		return errors.New("invalid value")
	}
	if amount.Sign() < 0 {
		return errors.New("negative value")
	}

	// Validate nonce
	expectedNonce := state.GetNonce(tx.From)
	if tx.Nonce != expectedNonce {
		return fmt.Errorf("nonce mismatch: expected %d, got %d", expectedNonce, tx.Nonce)
	}

	// Validate balance based on coin type
	switch tx.CoinType {
	case CoinGYDS:
		bal := state.GetGYDSBalance(tx.From)
		gasCost := new(big.Int).Mul(big.NewInt(int64(tx.GasPrice)), big.NewInt(int64(tx.GasLimit)))
		totalCost := new(big.Int).Add(amount, gasCost)
		if bal.Cmp(totalCost) < 0 {
			return fmt.Errorf("insufficient GYDS: have %s, need %s", bal.String(), totalCost.String())
		}
	case CoinGYD:
		bal := state.GetGYDBalance(tx.From)
		if bal.Cmp(amount) < 0 {
			return fmt.Errorf("insufficient GYD: have %s, need %s", bal.String(), amount.String())
		}
		// Gas is always paid in GYDS
		gasCost := new(big.Int).Mul(big.NewInt(int64(tx.GasPrice)), big.NewInt(int64(tx.GasLimit)))
		gydsBal := state.GetGYDSBalance(tx.From)
		if gydsBal.Cmp(gasCost) < 0 {
			return fmt.Errorf("insufficient GYDS for gas: have %s, need %s", gydsBal.String(), gasCost.String())
		}
	case CoinStake:
		bal := state.GetGYDSBalance(tx.From)
		if bal.Cmp(amount) < 0 {
			return fmt.Errorf("insufficient GYDS for staking: have %s, need %s", bal.String(), amount.String())
		}
	default:
		return fmt.Errorf("unknown coin type: %s", tx.CoinType)
	}

	// Validate hash
	expectedHash := ComputeTxHash(tx)
	if tx.Hash != expectedHash {
		return errors.New("hash mismatch")
	}

	// Signature validation placeholder
	// TODO: Implement ECDSA signature verification using utils.VerifySignature
	if tx.Signature == "" {
		return errors.New("missing signature")
	}

	return nil
}
