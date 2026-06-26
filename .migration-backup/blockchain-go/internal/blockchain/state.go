package blockchain

import (
	"encoding/json"
	"math/big"
	"sync"
)

// Account represents a dual-coin account state
type Account struct {
	GYDSBalance *big.Int `json:"gydsBalance"` // 18 decimals - gas/staking coin
	GYDBalance  *big.Int `json:"gydBalance"`  // 6 decimals - stablecoin
	StakeAmount *big.Int `json:"stakeAmount"` // GYDS staked
	Nonce       uint64   `json:"nonce"`
}

// StateDB manages all account states with snapshot/rollback support
type StateDB struct {
	mu       sync.RWMutex
	accounts map[string]*Account
}

// NewStateDB creates a new state database
func NewStateDB() *StateDB {
	return &StateDB{
		accounts: make(map[string]*Account),
	}
}

func (s *StateDB) getOrCreate(addr string) *Account {
	acc, exists := s.accounts[addr]
	if !exists {
		acc = &Account{
			GYDSBalance: new(big.Int),
			GYDBalance:  new(big.Int),
			StakeAmount: new(big.Int),
			Nonce:       0,
		}
		s.accounts[addr] = acc
	}
	return acc
}

// ── GYDS (18 decimals) ──────────────────────────────────────────

func (s *StateDB) GetGYDSBalance(addr string) *big.Int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return new(big.Int).Set(s.getOrCreate(addr).GYDSBalance)
}

func (s *StateDB) SetGYDSBalance(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.getOrCreate(addr).GYDSBalance = new(big.Int).Set(amount)
}

func (s *StateDB) AddGYDSBalance(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreate(addr)
	acc.GYDSBalance = new(big.Int).Add(acc.GYDSBalance, amount)
}

func (s *StateDB) SubGYDSBalance(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreate(addr)
	acc.GYDSBalance = new(big.Int).Sub(acc.GYDSBalance, amount)
}

// ── GYD (6 decimals) ────────────────────────────────────────────

func (s *StateDB) GetGYDBalance(addr string) *big.Int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return new(big.Int).Set(s.getOrCreate(addr).GYDBalance)
}

func (s *StateDB) SetGYDBalance(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.getOrCreate(addr).GYDBalance = new(big.Int).Set(amount)
}

func (s *StateDB) AddGYDBalance(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreate(addr)
	acc.GYDBalance = new(big.Int).Add(acc.GYDBalance, amount)
}

func (s *StateDB) SubGYDBalance(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreate(addr)
	acc.GYDBalance = new(big.Int).Sub(acc.GYDBalance, amount)
}

// ── Staking ─────────────────────────────────────────────────────

func (s *StateDB) GetStake(addr string) *big.Int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return new(big.Int).Set(s.getOrCreate(addr).StakeAmount)
}

func (s *StateDB) AddStake(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreate(addr)
	acc.StakeAmount = new(big.Int).Add(acc.StakeAmount, amount)
}

func (s *StateDB) SubStake(addr string, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.getOrCreate(addr)
	acc.StakeAmount = new(big.Int).Sub(acc.StakeAmount, amount)
}

// ── Nonce ───────────────────────────────────────────────────────

func (s *StateDB) GetNonce(addr string) uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getOrCreate(addr).Nonce
}

func (s *StateDB) SetNonce(addr string, nonce uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.getOrCreate(addr).Nonce = nonce
}

// ── Account Info ────────────────────────────────────────────────

func (s *StateDB) GetAccount(addr string) *Account {
	s.mu.RLock()
	defer s.mu.RUnlock()
	acc := s.getOrCreate(addr)
	return &Account{
		GYDSBalance: new(big.Int).Set(acc.GYDSBalance),
		GYDBalance:  new(big.Int).Set(acc.GYDBalance),
		StakeAmount: new(big.Int).Set(acc.StakeAmount),
		Nonce:       acc.Nonce,
	}
}

// AllAccounts returns all account addresses
func (s *StateDB) AllAccounts() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	addrs := make([]string, 0, len(s.accounts))
	for addr := range s.accounts {
		addrs = append(addrs, addr)
	}
	return addrs
}

// ── Snapshots & Rollback ────────────────────────────────────────

// CreateSnapshot serializes the entire state for backup
func (s *StateDB) CreateSnapshot() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()

	type serializedAccount struct {
		GYDS  string `json:"gyds"`
		GYD   string `json:"gyd"`
		Stake string `json:"stake"`
		Nonce uint64 `json:"nonce"`
	}

	snap := make(map[string]serializedAccount)
	for addr, acc := range s.accounts {
		snap[addr] = serializedAccount{
			GYDS:  acc.GYDSBalance.String(),
			GYD:   acc.GYDBalance.String(),
			Stake: acc.StakeAmount.String(),
			Nonce: acc.Nonce,
		}
	}

	data, _ := json.Marshal(snap)
	return data
}

// RollbackToSnapshot restores state from a snapshot
func (s *StateDB) RollbackToSnapshot(data []byte) {
	s.RestoreFromSnapshot(data)
}

// RestoreFromSnapshot loads state from serialized data
func (s *StateDB) RestoreFromSnapshot(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	type serializedAccount struct {
		GYDS  string `json:"gyds"`
		GYD   string `json:"gyd"`
		Stake string `json:"stake"`
		Nonce uint64 `json:"nonce"`
	}

	var snap map[string]serializedAccount
	if err := json.Unmarshal(data, &snap); err != nil {
		return
	}

	s.accounts = make(map[string]*Account)
	for addr, sa := range snap {
		gyds := new(big.Int)
		gyds.SetString(sa.GYDS, 10)
		gyd := new(big.Int)
		gyd.SetString(sa.GYD, 10)
		stake := new(big.Int)
		stake.SetString(sa.Stake, 10)

		s.accounts[addr] = &Account{
			GYDSBalance: gyds,
			GYDBalance:  gyd,
			StakeAmount: stake,
			Nonce:       sa.Nonce,
		}
	}
}
