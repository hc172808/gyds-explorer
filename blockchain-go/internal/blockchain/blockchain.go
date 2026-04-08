package blockchain

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/guardian-chain/blockchain-go/internal/database"
	"github.com/guardian-chain/blockchain-go/internal/utils"
)

// Header represents a block header
type Header struct {
	Number     uint64 `json:"number"`
	Hash       string `json:"hash"`
	ParentHash string `json:"parentHash"`
	Timestamp  int64  `json:"timestamp"`
	StateRoot  string `json:"stateRoot"`
	TxRoot     string `json:"txRoot"`
	Miner      string `json:"miner"`
	GasLimit   uint64 `json:"gasLimit"`
	GasUsed    uint64 `json:"gasUsed"`
	Nonce      uint64 `json:"nonce"`
	Difficulty *big.Int `json:"difficulty"`
}

// Block represents a full block
type Block struct {
	Header       Header         `json:"header"`
	Transactions []*Transaction `json:"transactions"`
}

// Blockchain is the core chain manager
type Blockchain struct {
	mu         sync.RWMutex
	db         database.Storage
	state      *StateDB
	latestHash string
	latestNum  uint64
	pendingTxs []*Transaction
	pendingMu  sync.Mutex
}

// NewBlockchain initializes or loads a blockchain
func NewBlockchain(db database.Storage) (*Blockchain, error) {
	bc := &Blockchain{
		db:    db,
		state: NewStateDB(),
	}

	// Try to load latest block
	latestData, err := db.Get([]byte("latest_block"))
	if err != nil || latestData == nil {
		// Create genesis block
		genesis := bc.createGenesis()
		if err := bc.saveBlock(genesis); err != nil {
			return nil, fmt.Errorf("failed to save genesis: %w", err)
		}
		bc.latestHash = genesis.Header.Hash
		bc.latestNum = 0
		return bc, nil
	}

	var latest Header
	if err := json.Unmarshal(latestData, &latest); err != nil {
		return nil, fmt.Errorf("corrupted latest block: %w", err)
	}
	bc.latestHash = latest.Hash
	bc.latestNum = latest.Number

	// Load state from DB
	stateData, err := db.Get([]byte("state_snapshot"))
	if err == nil && stateData != nil {
		bc.state.RestoreFromSnapshot(stateData)
	}

	return bc, nil
}

func (bc *Blockchain) createGenesis() *Block {
	header := Header{
		Number:     0,
		Timestamp:  time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC).Unix(),
		ParentHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
		StateRoot:  "0x0000000000000000000000000000000000000000000000000000000000000000",
		TxRoot:     "0x0000000000000000000000000000000000000000000000000000000000000000",
		Miner:      "0x0000000000000000000000000000000000000000",
		GasLimit:   30000000,
		GasUsed:    0,
		Difficulty: big.NewInt(1),
	}
	header.Hash = computeBlockHash(header)

	// Pre-fund genesis allocations
	bc.state.SetGYDSBalance("0x0000000000000000000000000000000000000001", new(big.Int).Mul(big.NewInt(1e18), big.NewInt(1000000000)))
	bc.state.SetGYDBalance("0x0000000000000000000000000000000000000001", new(big.Int).Mul(big.NewInt(1e6), big.NewInt(1000000000)))

	return &Block{Header: header, Transactions: []*Transaction{}}
}

func computeBlockHash(h Header) string {
	data, _ := json.Marshal(h)
	return utils.Keccak256Hex(data)
}

// AddBlock validates and adds a block to the chain
func (bc *Blockchain) AddBlock(block *Block) error {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	if err := bc.validateBlock(block); err != nil {
		return fmt.Errorf("block validation failed: %w", err)
	}

	// Create state snapshot for rollback
	snapshot := bc.state.CreateSnapshot()

	// Apply transactions
	for _, tx := range block.Transactions {
		if err := bc.applyTransaction(tx); err != nil {
			bc.state.RollbackToSnapshot(snapshot)
			return fmt.Errorf("tx %s failed: %w", tx.Hash, err)
		}
	}

	// Save block
	if err := bc.saveBlock(block); err != nil {
		bc.state.RollbackToSnapshot(snapshot)
		return err
	}

	bc.latestHash = block.Header.Hash
	bc.latestNum = block.Header.Number

	// Remove applied txs from pending pool
	bc.removePendingTxs(block.Transactions)

	return nil
}

func (bc *Blockchain) validateBlock(block *Block) error {
	if block.Header.Number != bc.latestNum+1 {
		return fmt.Errorf("expected block %d, got %d", bc.latestNum+1, block.Header.Number)
	}
	if block.Header.ParentHash != bc.latestHash {
		return errors.New("parent hash mismatch")
	}
	if block.Header.Timestamp <= 0 {
		return errors.New("invalid timestamp")
	}
	// Validate each transaction
	for _, tx := range block.Transactions {
		if err := ValidateTransaction(tx, bc.state); err != nil {
			return fmt.Errorf("invalid tx %s: %w", tx.Hash, err)
		}
	}
	return nil
}

func (bc *Blockchain) applyTransaction(tx *Transaction) error {
	switch tx.CoinType {
	case CoinGYDS:
		fromBal := bc.state.GetGYDSBalance(tx.From)
		amount := new(big.Int)
		amount.SetString(tx.Value, 10)
		if fromBal.Cmp(amount) < 0 {
			return errors.New("insufficient GYDS balance")
		}
		bc.state.SubGYDSBalance(tx.From, amount)
		bc.state.AddGYDSBalance(tx.To, amount)
	case CoinGYD:
		fromBal := bc.state.GetGYDBalance(tx.From)
		amount := new(big.Int)
		amount.SetString(tx.Value, 10)
		if fromBal.Cmp(amount) < 0 {
			return errors.New("insufficient GYD balance")
		}
		bc.state.SubGYDBalance(tx.From, amount)
		bc.state.AddGYDBalance(tx.To, amount)
	case CoinStake:
		return bc.applyStakeTx(tx)
	default:
		return fmt.Errorf("unknown coin type: %s", tx.CoinType)
	}

	// Increment nonce
	bc.state.SetNonce(tx.From, tx.Nonce+1)
	return nil
}

func (bc *Blockchain) applyStakeTx(tx *Transaction) error {
	amount := new(big.Int)
	amount.SetString(tx.Value, 10)
	bal := bc.state.GetGYDSBalance(tx.From)
	if bal.Cmp(amount) < 0 {
		return errors.New("insufficient GYDS for staking")
	}
	bc.state.SubGYDSBalance(tx.From, amount)
	bc.state.AddStake(tx.From, amount)
	return nil
}

func (bc *Blockchain) saveBlock(block *Block) error {
	data, err := json.Marshal(block)
	if err != nil {
		return err
	}
	// Save block by hash
	if err := bc.db.Put([]byte("block:"+block.Header.Hash), data); err != nil {
		return err
	}
	// Save block by number
	key := fmt.Sprintf("block_num:%d", block.Header.Number)
	if err := bc.db.Put([]byte(key), data); err != nil {
		return err
	}
	// Update latest
	headerData, _ := json.Marshal(block.Header)
	if err := bc.db.Put([]byte("latest_block"), headerData); err != nil {
		return err
	}
	// Save state snapshot
	snapData := bc.state.CreateSnapshot()
	return bc.db.Put([]byte("state_snapshot"), snapData)
}

// AddPendingTx adds a transaction to the pending pool
func (bc *Blockchain) AddPendingTx(tx *Transaction) error {
	if err := ValidateTransaction(tx, bc.state); err != nil {
		return err
	}
	bc.pendingMu.Lock()
	defer bc.pendingMu.Unlock()
	bc.pendingTxs = append(bc.pendingTxs, tx)
	return nil
}

// PendingTxs returns pending transactions
func (bc *Blockchain) PendingTxs() []*Transaction {
	bc.pendingMu.Lock()
	defer bc.pendingMu.Unlock()
	result := make([]*Transaction, len(bc.pendingTxs))
	copy(result, bc.pendingTxs)
	return result
}

func (bc *Blockchain) removePendingTxs(applied []*Transaction) {
	bc.pendingMu.Lock()
	defer bc.pendingMu.Unlock()
	appliedSet := make(map[string]bool)
	for _, tx := range applied {
		appliedSet[tx.Hash] = true
	}
	filtered := make([]*Transaction, 0)
	for _, tx := range bc.pendingTxs {
		if !appliedSet[tx.Hash] {
			filtered = append(filtered, tx)
		}
	}
	bc.pendingTxs = filtered
}

// GetBlock retrieves a block by hash
func (bc *Blockchain) GetBlock(hash string) (*Block, error) {
	data, err := bc.db.Get([]byte("block:" + hash))
	if err != nil {
		return nil, err
	}
	var block Block
	if err := json.Unmarshal(data, &block); err != nil {
		return nil, err
	}
	return &block, nil
}

// GetBlockByNumber retrieves a block by number
func (bc *Blockchain) GetBlockByNumber(num uint64) (*Block, error) {
	key := fmt.Sprintf("block_num:%d", num)
	data, err := bc.db.Get([]byte(key))
	if err != nil {
		return nil, err
	}
	var block Block
	if err := json.Unmarshal(data, &block); err != nil {
		return nil, err
	}
	return &block, nil
}

// LatestBlock returns the latest block number and hash
func (bc *Blockchain) LatestBlock() (uint64, string) {
	bc.mu.RLock()
	defer bc.mu.RUnlock()
	return bc.latestNum, bc.latestHash
}

// State returns the state database
func (bc *Blockchain) State() *StateDB {
	return bc.state
}

// DB returns the storage interface
func (bc *Blockchain) DB() database.Storage {
	return bc.db
}

// SerializeBlock marshals a block for network transmission
func SerializeBlock(b *Block) ([]byte, error) {
	return json.Marshal(b)
}

// DeserializeBlock unmarshals a block from network data
func DeserializeBlock(data []byte) (*Block, error) {
	var b Block
	err := json.Unmarshal(data, &b)
	return &b, err
}

// SerializeTx marshals a transaction
func SerializeTx(tx *Transaction) ([]byte, error) {
	return json.Marshal(tx)
}

// DeserializeTx unmarshals a transaction
func DeserializeTx(data []byte) (*Transaction, error) {
	var tx Transaction
	err := json.Unmarshal(data, &tx)
	return &tx, err
}
