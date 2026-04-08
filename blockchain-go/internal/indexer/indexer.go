package indexer

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/guardian-chain/blockchain-go/internal/blockchain"
	"github.com/guardian-chain/blockchain-go/internal/database"
)

// IndexedAccount stores indexed account data
type IndexedAccount struct {
	Address      string   `json:"address"`
	GYDSBalance  string   `json:"gydsBalance"`
	GYDBalance   string   `json:"gydBalance"`
	StakeAmount  string   `json:"stakeAmount"`
	TxCount      uint64   `json:"txCount"`
	LastActiveAt int64    `json:"lastActiveAt"`
}

// Indexer watches the blockchain and indexes data for fast querying
type Indexer struct {
	mu           sync.RWMutex
	db           database.Storage
	chain        *blockchain.Blockchain
	lastIndexed  uint64
	running      bool
	stopCh       chan struct{}
	accounts     map[string]*IndexedAccount
	txIndex      map[string]uint64 // txHash -> blockNumber
}

// NewIndexer creates a new blockchain indexer
func NewIndexer(db database.Storage, chain *blockchain.Blockchain) *Indexer {
	return &Indexer{
		db:       db,
		chain:    chain,
		stopCh:   make(chan struct{}),
		accounts: make(map[string]*IndexedAccount),
		txIndex:  make(map[string]uint64),
	}
}

// Start begins the indexing loop
func (idx *Indexer) Start() {
	idx.running = true
	log.Println("Indexer started")

	// Load last indexed block
	data, err := idx.db.Get([]byte("indexer:last_block"))
	if err == nil && data != nil {
		fmt.Sscanf(string(data), "%d", &idx.lastIndexed)
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-idx.stopCh:
			return
		case <-ticker.C:
			idx.indexNewBlocks()
		}
	}
}

// Stop halts the indexer
func (idx *Indexer) Stop() {
	idx.running = false
	close(idx.stopCh)
}

func (idx *Indexer) indexNewBlocks() {
	latestNum, _ := idx.chain.LatestBlock()
	for blockNum := idx.lastIndexed + 1; blockNum <= latestNum; blockNum++ {
		block, err := idx.chain.GetBlockByNumber(blockNum)
		if err != nil {
			log.Printf("Indexer: failed to get block %d: %v", blockNum, err)
			return
		}
		idx.indexBlock(block)
		idx.lastIndexed = blockNum
		idx.db.Put([]byte("indexer:last_block"), []byte(fmt.Sprintf("%d", blockNum)))
	}
}

func (idx *Indexer) indexBlock(block *blockchain.Block) {
	idx.mu.Lock()
	defer idx.mu.Unlock()

	for _, tx := range block.Transactions {
		// Index transaction
		idx.txIndex[tx.Hash] = block.Header.Number
		txKey := fmt.Sprintf("idx:tx:%s", tx.Hash)
		txData, _ := json.Marshal(tx)
		idx.db.Put([]byte(txKey), txData)

		// Index accounts
		idx.updateAccount(tx.From, block.Header.Timestamp)
		idx.updateAccount(tx.To, block.Header.Timestamp)

		// Index address transactions
		fromKey := fmt.Sprintf("idx:addr_tx:%s:%d", tx.From, block.Header.Number)
		idx.db.Put([]byte(fromKey), []byte(tx.Hash))
		toKey := fmt.Sprintf("idx:addr_tx:%s:%d", tx.To, block.Header.Number)
		idx.db.Put([]byte(toKey), []byte(tx.Hash))
	}

	// Index miner
	idx.updateAccount(block.Header.Miner, block.Header.Timestamp)
}

func (idx *Indexer) updateAccount(addr string, timestamp int64) {
	acc, exists := idx.accounts[addr]
	if !exists {
		acc = &IndexedAccount{Address: addr}
		idx.accounts[addr] = acc
	}

	// Update from state
	stateAcc := idx.chain.State().GetAccount(addr)
	acc.GYDSBalance = stateAcc.GYDSBalance.String()
	acc.GYDBalance = stateAcc.GYDBalance.String()
	acc.StakeAmount = stateAcc.StakeAmount.String()
	acc.TxCount++
	acc.LastActiveAt = timestamp

	data, _ := json.Marshal(acc)
	idx.db.Put([]byte("idx:account:"+addr), data)
}

// GetAccount retrieves an indexed account
func (idx *Indexer) GetAccount(addr string) (*IndexedAccount, error) {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	data, err := idx.db.Get([]byte("idx:account:" + addr))
	if err != nil || data == nil {
		return nil, fmt.Errorf("account not found: %s", addr)
	}

	var acc IndexedAccount
	if err := json.Unmarshal(data, &acc); err != nil {
		return nil, err
	}
	return &acc, nil
}

// GetTransaction retrieves an indexed transaction
func (idx *Indexer) GetTransaction(hash string) (*blockchain.Transaction, error) {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	data, err := idx.db.Get([]byte("idx:tx:" + hash))
	if err != nil || data == nil {
		return nil, fmt.Errorf("transaction not found: %s", hash)
	}

	var tx blockchain.Transaction
	if err := json.Unmarshal(data, &tx); err != nil {
		return nil, err
	}
	return &tx, nil
}

// GetLastIndexedBlock returns the last indexed block number
func (idx *Indexer) GetLastIndexedBlock() uint64 {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	return idx.lastIndexed
}
