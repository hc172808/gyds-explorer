package consensus

import (
	"math/big"
	"sort"
	"sync"

	"github.com/guardian-chain/blockchain-go/internal/blockchain"
)

// MinStake is the minimum GYDS required to become a validator (1000 GYDS)
var MinStake = new(big.Int).Mul(big.NewInt(1000), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))

// ProofOfStake manages validator selection and staking consensus
type ProofOfStake struct {
	mu    sync.RWMutex
	state *blockchain.StateDB
}

// NewProofOfStake creates a new PoS consensus engine
func NewProofOfStake(state *blockchain.StateDB) *ProofOfStake {
	return &ProofOfStake{state: state}
}

// IsValidator checks if an address has enough stake to validate
func (pos *ProofOfStake) IsValidator(addr string) bool {
	stake := pos.state.GetStake(addr)
	return stake.Cmp(MinStake) >= 0
}

// GetValidators returns all addresses meeting the minimum stake
func (pos *ProofOfStake) GetValidators() []string {
	pos.mu.RLock()
	defer pos.mu.RUnlock()

	var validators []string
	for _, addr := range pos.state.AllAccounts() {
		if pos.IsValidator(addr) {
			validators = append(validators, addr)
		}
	}

	// Sort by stake descending for deterministic ordering
	sort.Slice(validators, func(i, j int) bool {
		si := pos.state.GetStake(validators[i])
		sj := pos.state.GetStake(validators[j])
		return si.Cmp(sj) > 0
	})

	return validators
}

// SelectValidator picks the next block producer based on stake weight
// Uses a simple round-robin weighted by stake amount
func (pos *ProofOfStake) SelectValidator(blockNumber uint64) string {
	validators := pos.GetValidators()
	if len(validators) == 0 {
		return "" // No validators, fall back to PoW
	}

	// Weighted selection: higher stake = more frequent selection
	totalStake := new(big.Int)
	for _, v := range validators {
		totalStake.Add(totalStake, pos.state.GetStake(v))
	}

	// Use block number as seed for deterministic selection
	target := new(big.Int).Mod(big.NewInt(int64(blockNumber)), totalStake)

	cumulative := new(big.Int)
	for _, v := range validators {
		cumulative.Add(cumulative, pos.state.GetStake(v))
		if cumulative.Cmp(target) > 0 {
			return v
		}
	}

	return validators[0]
}

// CalculateDifficulty adjusts difficulty based on stake
// Higher stake = lower difficulty (easier to mine)
func (pos *ProofOfStake) CalculateDifficulty(stake *big.Int) *big.Int {
	baseDifficulty := big.NewInt(1000000)

	if stake.Sign() == 0 {
		return baseDifficulty
	}

	// Reduce difficulty proportionally to stake
	// difficulty = baseDifficulty / (1 + stake/MinStake)
	ratio := new(big.Int).Div(stake, MinStake)
	divisor := new(big.Int).Add(big.NewInt(1), ratio)
	adjusted := new(big.Int).Div(baseDifficulty, divisor)

	if adjusted.Sign() <= 0 {
		return big.NewInt(1)
	}
	return adjusted
}

// CalculateRewardBonus computes additional mining reward based on stake
// Bonus = base_reward * (stake / total_stake) * 0.5
func (pos *ProofOfStake) CalculateRewardBonus(stake *big.Int) *big.Int {
	if stake.Sign() == 0 {
		return new(big.Int)
	}

	validators := pos.GetValidators()
	totalStake := new(big.Int)
	for _, v := range validators {
		totalStake.Add(totalStake, pos.state.GetStake(v))
	}

	if totalStake.Sign() == 0 {
		return new(big.Int)
	}

	// Bonus = BlockReward * stake / totalStake / 2
	bonus := new(big.Int).Mul(blockchain.BlockReward, stake)
	bonus.Div(bonus, totalStake)
	bonus.Div(bonus, big.NewInt(2))

	return bonus
}

// ValidateStake checks if a staking transaction is valid
func (pos *ProofOfStake) ValidateStake(addr string, amount *big.Int) error {
	// Any positive amount can be staked
	if amount.Sign() <= 0 {
		return errInvalidStakeAmount
	}
	return nil
}

// Custom errors
type posError string

func (e posError) Error() string { return string(e) }

const errInvalidStakeAmount = posError("stake amount must be positive")
