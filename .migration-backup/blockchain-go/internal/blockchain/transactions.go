package blockchain

import (
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/guardian-chain/blockchain-go/internal/networkconfig"
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
	ChainID   uint64   `json:"chainId"`
	Hash      string   `json:"hash"`
	From      string   `json:"from"`
	To        string   `json:"to"`
	Value     string   `json:"value"`    // Integer base units: GYDS/STAKE 10^18, GYD 10^6
	CoinType  CoinType `json:"coinType"` // GYDS, GYD, or STAKE
	Nonce     uint64   `json:"nonce"`
	GasPrice  uint64   `json:"gasPrice"` // GYDS base units per gas, regardless of CoinType
	GasLimit  uint64   `json:"gasLimit"`
	Data      []byte   `json:"data,omitempty"` // Contract data (future use)
	PublicKey string   `json:"publicKey"`      // Uncompressed P-256 public key, hex encoded
	Signature string   `json:"signature"`      // Fixed-width P-256 r||s, hex encoded
	Timestamp int64    `json:"timestamp"`
}

const transactionSigningDomain = "guardian-chain-transaction-v1"

type transactionSigningPayload struct {
	Domain    string   `json:"domain"`
	ChainID   uint64   `json:"chainId"`
	From      string   `json:"from"`
	To        string   `json:"to"`
	Value     string   `json:"value"`
	CoinType  CoinType `json:"coinType"`
	Nonce     uint64   `json:"nonce"`
	GasPrice  uint64   `json:"gasPrice"`
	GasLimit  uint64   `json:"gasLimit"`
	Data      []byte   `json:"data,omitempty"`
	Timestamp int64    `json:"timestamp"`
}

func (tx *Transaction) signingPayload() ([]byte, error) {
	return json.Marshal(transactionSigningPayload{
		Domain:    transactionSigningDomain,
		ChainID:   tx.ChainID,
		From:      strings.ToLower(tx.From),
		To:        strings.ToLower(tx.To),
		Value:     tx.Value,
		CoinType:  tx.CoinType,
		Nonce:     tx.Nonce,
		GasPrice:  tx.GasPrice,
		GasLimit:  tx.GasLimit,
		Data:      tx.Data,
		Timestamp: tx.Timestamp,
	})
}

// ComputeTxHash returns a deterministic ID over the chain-bound payload and
// its public key/signature. The signature itself signs signingPayload only.
func ComputeTxHash(tx *Transaction) string {
	if tx == nil {
		return ""
	}
	payload, err := tx.signingPayload()
	if err != nil {
		return ""
	}
	envelope, err := json.Marshal(struct {
		Payload   json.RawMessage `json:"payload"`
		PublicKey string          `json:"publicKey"`
		Signature string          `json:"signature"`
	}{
		Payload:   payload,
		PublicKey: tx.PublicKey,
		Signature: tx.Signature,
	})
	if err != nil {
		return ""
	}
	return utils.Keccak256Hex(envelope)
}

// SignTransaction binds the transaction to a supported chain and signs it
// using the prototype's documented P-256 address scheme.
func SignTransaction(tx *Transaction, privateKey *ecdsa.PrivateKey, chainID uint64) error {
	if tx == nil || privateKey == nil {
		return errors.New("transaction and private key are required")
	}
	if _, err := networkconfig.FromChainID(chainID); err != nil {
		return err
	}
	publicKeyHex, err := utils.PublicKeyToHex(&privateKey.PublicKey)
	if err != nil {
		return err
	}
	from := utils.PubKeyToAddress(&privateKey.PublicKey)
	if from == "" {
		return errors.New("could not derive sender address from P-256 key")
	}
	if tx.From != "" && !strings.EqualFold(tx.From, from) {
		return errors.New("transaction sender does not match the signing key")
	}

	tx.ChainID = chainID
	tx.From = from
	tx.PublicKey = publicKeyHex
	payload, err := tx.signingPayload()
	if err != nil {
		return fmt.Errorf("could not encode transaction for signing: %w", err)
	}
	tx.Signature, err = utils.SignData(privateKey, payload)
	if err != nil {
		return err
	}
	tx.Hash = ComputeTxHash(tx)
	if tx.Hash == "" {
		return errors.New("could not compute transaction hash")
	}
	return nil
}

// ValidateTransaction checks chain identity, signature, nonce and balances.
func ValidateTransaction(tx *Transaction, state *StateDB, expectedChainID uint64) error {
	if tx == nil || state == nil {
		return errors.New("transaction and state are required")
	}
	if _, err := networkconfig.FromChainID(expectedChainID); err != nil {
		return err
	}
	if tx.ChainID != expectedChainID {
		return fmt.Errorf("wrong transaction chain ID: expected %d, got %d", expectedChainID, tx.ChainID)
	}

	// Validate addresses
	if !isAddress(tx.From) || !isAddress(tx.To) {
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
		gasCost := new(big.Int).Mul(new(big.Int).SetUint64(tx.GasPrice), new(big.Int).SetUint64(tx.GasLimit))
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
		gasCost := new(big.Int).Mul(new(big.Int).SetUint64(tx.GasPrice), new(big.Int).SetUint64(tx.GasLimit))
		gydsBal := state.GetGYDSBalance(tx.From)
		if gydsBal.Cmp(gasCost) < 0 {
			return fmt.Errorf("insufficient GYDS for gas: have %s, need %s", gydsBal.String(), gasCost.String())
		}
	case CoinStake:
		bal := state.GetGYDSBalance(tx.From)
		gasCost := new(big.Int).Mul(new(big.Int).SetUint64(tx.GasPrice), new(big.Int).SetUint64(tx.GasLimit))
		totalCost := new(big.Int).Add(amount, gasCost)
		if bal.Cmp(totalCost) < 0 {
			return fmt.Errorf("insufficient GYDS for staking and gas: have %s, need %s", bal.String(), totalCost.String())
		}
	default:
		return fmt.Errorf("unknown coin type: %s", tx.CoinType)
	}

	if tx.Timestamp <= 0 || tx.Timestamp > time.Now().Add(15*time.Second).Unix() {
		return errors.New("invalid transaction timestamp")
	}
	if tx.Nonce == ^uint64(0) {
		return errors.New("transaction nonce cannot be incremented")
	}

	publicKey, err := utils.PublicKeyFromHex(tx.PublicKey)
	if err != nil {
		return fmt.Errorf("invalid transaction public key: %w", err)
	}
	if !strings.EqualFold(utils.PubKeyToAddress(publicKey), tx.From) {
		return errors.New("transaction sender does not match its public key")
	}
	payload, err := tx.signingPayload()
	if err != nil {
		return fmt.Errorf("could not encode transaction signing payload: %w", err)
	}
	validSignature, err := utils.VerifySignature(publicKey, payload, tx.Signature)
	if err != nil {
		return fmt.Errorf("invalid transaction signature: %w", err)
	}
	if !validSignature {
		return errors.New("invalid transaction signature")
	}

	// Validate the transaction ID after verifying the signed payload.
	expectedHash := ComputeTxHash(tx)
	if tx.Hash != expectedHash {
		return errors.New("hash mismatch")
	}

	return nil
}

func isAddress(value string) bool {
	if len(value) != 42 || !strings.HasPrefix(value, "0x") {
		return false
	}
	_, err := hex.DecodeString(value[2:])
	return err == nil
}
