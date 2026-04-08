package blockchain

import (
	"log"
	"math/big"
	"time"

	"github.com/guardian-chain/blockchain-go/internal/consensus"
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

// Stop halts the miner
func (m *Miner) Stop() {
	m.running = false
	close(m.stopCh)
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
	header.StateRoot = "0x" + string(m.chain.State().CreateSnapshot()[:64])
	header.Hash = computeBlockHash(header)

	block := &Block{
		Header:       header,
		Transactions: pendingTxs,
	}

	// Apply mining reward (GYDS only)
	m.chain.State().AddGYDSBalance(m.minerAddress, BlockReward)

	// PoS bonus: additional reward proportional to stake
	stakeBonus := m.pos.CalculateRewardBonus(stake)
	if stakeBonus.Sign() > 0 {
		m.chain.State().AddGYDSBalance(m.minerAddress, stakeBonus)
	}

	return block
}

func (m *Miner) calculateGasUsed(txs []*Transaction) uint64 {
	var total uint64
	for _, tx := range txs {
		total += tx.GasLimit
	}
	return total
}

func computeTxRoot(txs []*Transaction) string {
	if len(txs) == 0 {
		return "0x0000000000000000000000000000000000000000000000000000000000000000"
	}
	var combined []byte
	for _, tx := range txs {
		combined = append(combined, []byte(tx.Hash)...)
	}
	return computeBlockHash(Header{}) // Simplified - should be Merkle root
}
