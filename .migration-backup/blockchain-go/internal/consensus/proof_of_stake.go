package consensus

import (
	"math/big"
	"sort"
	"sync"
)

// MinStake is the minimum GYDS required to become a validator (1000 GYDS)
var MinStake = new(big.Int).Mul(big.NewInt(1000), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))

// BlockReward used for PoS bonus calculation (kept in sync with blockchain.BlockReward)
var BlockReward = new(big.Int).Mul(big.NewInt(2), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))

// StateReader is the minimal state interface PoS needs.
// This avoids importing the blockchain package and prevents an import cycle.
type StateReader interface {
	GetStake(addr string) *big.Int
	AllAccounts() []string
}

// ProofOfStake manages validator selection and staking consensus
type ProofOfStake struct {
	mu    sync.RWMutex
	state StateReader
}

// NewProofOfStake creates a new PoS consensus engine
func NewProofOfStake(state StateReader) *ProofOfStake {
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

	sort.Slice(validators, func(i, j int) bool {
		si := pos.state.GetStake(validators[i])
		sj := pos.state.GetStake(validators[j])
		return si.Cmp(sj) > 0
	})

	return validators
}

// SelectValidator picks the next block producer based on stake weight
func (pos *ProofOfStake) SelectValidator(blockNumber uint64) string {
	validators := pos.GetValidators()
	if len(validators) == 0 {
		return ""
	}

	totalStake := new(big.Int)
	for _, v := range validators {
		totalStake.Add(totalStake, pos.state.GetStake(v))
	}

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
func (pos *ProofOfStake) CalculateDifficulty(stake *big.Int) *big.Int {
	baseDifficulty := big.NewInt(1000000)

	if stake.Sign() == 0 {
		return baseDifficulty
	}

	ratio := new(big.Int).Div(stake, MinStake)
	divisor := new(big.Int).Add(big.NewInt(1), ratio)
	adjusted := new(big.Int).Div(baseDifficulty, divisor)

	if adjusted.Sign() <= 0 {
		return big.NewInt(1)
	}
	return adjusted
}

// CalculateRewardBonus computes additional mining reward based on stake
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

	bonus := new(big.Int).Mul(BlockReward, stake)
	bonus.Div(bonus, totalStake)
	bonus.Div(bonus, big.NewInt(2))

	return bonus
}

// ValidateStake checks if a staking transaction is valid
func (pos *ProofOfStake) ValidateStake(addr string, amount *big.Int) error {
	if amount.Sign() <= 0 {
		return errInvalidStakeAmount
	}
	return nil
}

type posError string

func (e posError) Error() string { return string(e) }

const errInvalidStakeAmount = posError("stake amount must be positive")
