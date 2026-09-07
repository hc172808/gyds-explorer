package blockchain

import (
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/guardian-chain/blockchain-go/internal/consensus"
	"github.com/guardian-chain/blockchain-go/internal/utils"
)

// Block reward: 2 GYDS per block (2 * 10^18 wei)
var BlockReward = new(big.Int).Mul(big.NewInt(2), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))

// Miner produces new blocks
type Miner struct {
	chain        *Blockchain
	pos          *consensus.ProofOfStake
	minerAddress string
	running      bool
	stopCh       chan struct{}
	stopOnce     sync.Once
}

// NewMiner creates a new block miner
func NewMiner(chain *Blockchain, pos *consensus.ProofOfStake, address string) *Miner {
	return &Miner{
		chain:        chain,
		pos:          pos,
		minerAddress: address,
		stopCh:       make(chan struct{}),
	}
}

// Start begins the mining loop
func (m *Miner) Start(onBlock func(*Block)) {
	m.running = true
	log.Printf("Miner started: %s", m.minerAddress)

	ticker := time.NewTicker(12 * time.Second) // ~12 second block time
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			log.Println("Miner stopped")
			return
		case <-ticker.C:
			if !m.running {
				continue
			}

			// Check if this miner is a valid validator via PoS
			if !m.pos.IsValidator(m.minerAddress) {
				// Still allow mining but with reduced priority
				// In a full implementation, non-validators would wait longer
			}

			block := m.mineBlock()
			if block != nil {
				if err := m.chain.AddBlock(block); err != nil {
					log.Printf("Failed to add mined block: %v", err)
					continue
				}
				log.Printf("Mined block #%d with %d txs", block.Header.Number, len(block.Transactions))
				if onBlock != nil {
					onBlock(block)
				}
			}
		}
	}
}

// Stop halts the miner. Safe to call more than once.
func (m *Miner) Stop() {
	m.stopOnce.Do(func() {
		m.running = false
		close(m.stopCh)
	})
}

func (m *Miner) mineBlock() *Block {
	latestNum, latestHash := m.chain.LatestBlock()
	pendingTxs := m.chain.PendingTxs()

	// Calculate PoS-adjusted difficulty
	stake := m.chain.State().GetStake(m.minerAddress)
	difficulty := m.pos.CalculateDifficulty(stake)

	header := Header{
		Number:     latestNum + 1,
		ParentHash: latestHash,
		Timestamp:  time.Now().Unix(),
		Miner:      m.minerAddress,
		GasLimit:   30000000,
		GasUsed:    m.calculateGasUsed(pendingTxs),
		Difficulty: difficulty,
	}

	// Compute state and tx roots
	header.TxRoot = computeTxRoot(pendingTxs)
	header.StateRoot = utils.Keccak256Hex(m.chain.State().CreateSnapshot())
	header.Hash = computeBlockHash(header)

	block := &Block{
		Header:       header,
		Transactions: pendingTxs,
	}

	// The block reward is credited inside Blockchain.AddBlock so that every node
	// replaying this block computes the same state. Nothing is credited here.
	return block
}

func (m *Miner) calculateGasUsed(txs []*Transaction) uint64 {
	var total uint64
	for _, tx := range txs {
		total += tx.GasLimit
	}
	return total
}

// computeTxRoot builds a binary Merkle root over the transaction hashes.
func computeTxRoot(txs []*Transaction) string {
	if len(txs) == 0 {
		return "0x0000000000000000000000000000000000000000000000000000000000000000"
	}
	layer := make([]string, 0, len(txs))
	for _, tx := range txs {
		layer = append(layer, tx.Hash)
	}
	for len(layer) > 1 {
		next := make([]string, 0, (len(layer)+1)/2)
		for i := 0; i < len(layer); i += 2 {
			right := layer[i]
			if i+1 < len(layer) {
				right = layer[i+1]
			}
			next = append(next, utils.Keccak256Hex([]byte(layer[i]+right)))
		}
		layer = next
	}
	return layer[0]
}
