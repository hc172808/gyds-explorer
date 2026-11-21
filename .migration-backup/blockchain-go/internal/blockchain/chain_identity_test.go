package blockchain

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"sync"
	"testing"

	"github.com/guardian-chain/blockchain-go/internal/database"
	"github.com/guardian-chain/blockchain-go/internal/networkconfig"
)

type memoryStorage struct {
	mu     sync.RWMutex
	values map[string][]byte
}

func newMemoryStorage() *memoryStorage {
	return &memoryStorage{values: make(map[string][]byte)}
}

func (s *memoryStorage) Get(key []byte) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	value, ok := s.values[string(key)]
	if !ok {
		return nil, nil
	}
	return append([]byte(nil), value...), nil
}

func (s *memoryStorage) Put(key, value []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[string(key)] = append([]byte(nil), value...)
	return nil
}

func (s *memoryStorage) Delete(key []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.values, string(key))
	return nil
}

func (s *memoryStorage) Has(key []byte) (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.values[string(key)]
	return ok, nil
}

func (s *memoryStorage) BatchPut(pairs map[string][]byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, value := range pairs {
		s.values[key] = append([]byte(nil), value...)
	}
	return nil
}

func (s *memoryStorage) Iterator(prefix []byte) database.Iterator {
	s.mu.RLock()
	defer s.mu.RUnlock()

	keys := make([]string, 0, len(s.values))
	for key := range s.values {
		if bytes.HasPrefix([]byte(key), prefix) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	values := make([][]byte, len(keys))
	for index, key := range keys {
		values[index] = append([]byte(nil), s.values[key]...)
	}
	return &memoryIterator{keys: keys, values: values, index: -1}
}

func (s *memoryStorage) Close() error { return nil }

type memoryIterator struct {
	keys   []string
	values [][]byte
	index  int
}

func (it *memoryIterator) Next() bool {
	it.index++
	return it.index < len(it.keys)
}

func (it *memoryIterator) Key() []byte {
	if it.index < 0 || it.index >= len(it.keys) {
		return nil
	}
	return []byte(it.keys[it.index])
}

func (it *memoryIterator) Value() []byte {
	if it.index < 0 || it.index >= len(it.values) {
		return nil
	}
	return append([]byte(nil), it.values[it.index]...)
}

func (it *memoryIterator) Release() {}

var _ database.Storage = (*memoryStorage)(nil)

func TestNewBlockchainPersistsAndChecksChainIdentity(t *testing.T) {
	store := newMemoryStorage()
	chain, err := NewBlockchain(store, networkconfig.MainnetChainID)
	if err != nil {
		t.Fatal(err)
	}
	if chain.ChainID() != networkconfig.MainnetChainID {
		t.Fatalf("chain ID = %d, want %d", chain.ChainID(), networkconfig.MainnetChainID)
	}

	genesisData, err := store.Get([]byte("block_num:0"))
	if err != nil {
		t.Fatal(err)
	}
	var genesis Block
	if err := json.Unmarshal(genesisData, &genesis); err != nil {
		t.Fatal(err)
	}
	expectedHash, err := ExpectedGenesisHash(networkconfig.MainnetChainID)
	if err != nil {
		t.Fatal(err)
	}
	if genesis.Header.ChainID != networkconfig.MainnetChainID || genesis.Header.Hash != expectedHash {
		t.Fatalf("unexpected Mainnet genesis identity: chain=%d hash=%s", genesis.Header.ChainID, genesis.Header.Hash)
	}

	reopened, err := NewBlockchain(store, networkconfig.MainnetChainID)
	if err != nil {
		t.Fatalf("same-chain database did not reopen: %v", err)
	}
	if reopened.ChainID() != networkconfig.MainnetChainID {
		t.Fatalf("reopened chain ID = %d, want %d", reopened.ChainID(), networkconfig.MainnetChainID)
	}
}

func TestNewBlockchainRejectsOtherNetworkWithoutResettingData(t *testing.T) {
	store := newMemoryStorage()
	if _, err := NewBlockchain(store, networkconfig.MainnetChainID); err != nil {
		t.Fatal(err)
	}
	beforeLatest, _ := store.Get([]byte("latest_block"))
	beforeIdentity, _ := store.Get([]byte(chainIdentityKey))

	if _, err := NewBlockchain(store, networkconfig.TestnetChainID); err == nil {
		t.Fatal("Mainnet data must not open as Testnet")
	}
	afterLatest, _ := store.Get([]byte("latest_block"))
	afterIdentity, _ := store.Get([]byte(chainIdentityKey))
	if !bytes.Equal(beforeLatest, afterLatest) || !bytes.Equal(beforeIdentity, afterIdentity) {
		t.Fatal("chain mismatch modified persisted data")
	}
}

func TestNewBlockchainFailsClosedForLegacyAndIncompleteData(t *testing.T) {
	t.Run("legacy data without identity", func(t *testing.T) {
		store := newMemoryStorage()
		if err := store.Put([]byte("latest_block"), []byte(`{"number":0,"hash":"legacy"}`)); err != nil {
			t.Fatal(err)
		}
		if _, err := NewBlockchain(store, networkconfig.MainnetChainID); err == nil {
			t.Fatal("legacy database without chain identity must be rejected")
		}
		if value, _ := store.Get([]byte("latest_block")); string(value) != `{"number":0,"hash":"legacy"}` {
			t.Fatal("legacy latest block was overwritten")
		}
	})

	t.Run("identity without chain data", func(t *testing.T) {
		store := newMemoryStorage()
		identity, _ := json.Marshal(persistedChainIdentity{Version: chainStorageVersion, ChainID: networkconfig.MainnetChainID})
		if err := store.Put([]byte(chainIdentityKey), identity); err != nil {
			t.Fatal(err)
		}
		if _, err := NewBlockchain(store, networkconfig.MainnetChainID); err == nil {
			t.Fatal("partial database must not be initialized over")
		}
	})

	t.Run("orphaned data", func(t *testing.T) {
		store := newMemoryStorage()
		if err := store.Put([]byte("state_snapshot"), []byte("orphan")); err != nil {
			t.Fatal(err)
		}
		if _, err := NewBlockchain(store, networkconfig.MainnetChainID); err == nil {
			t.Fatal("database with orphaned state must not be initialized")
		}
		if value, _ := store.Get([]byte("state_snapshot")); string(value) != "orphan" {
			t.Fatal("orphaned state was overwritten")
		}
	})
}

func TestNewBlockchainRejectsUnsupportedChainIDWithoutWriting(t *testing.T) {
	store := newMemoryStorage()
	if _, err := NewBlockchain(store, 1); err == nil {
		t.Fatal("unsupported chain ID must be rejected")
	}
	if databaseHasAnyData(store) {
		t.Fatal("unsupported chain ID wrote data to the database")
	}
}

func TestGenesisHashesDifferAcrossNetworks(t *testing.T) {
	mainnetHash, err := ExpectedGenesisHash(networkconfig.MainnetChainID)
	if err != nil {
		t.Fatal(err)
	}
	testnetHash, err := ExpectedGenesisHash(networkconfig.TestnetChainID)
	if err != nil {
		t.Fatal(err)
	}
	if mainnetHash == testnetHash {
		t.Fatal("Mainnet and Testnet must have distinct genesis hashes")
	}
}

func TestBlockRejectsMismatchedChainID(t *testing.T) {
	chain, err := NewBlockchain(newMemoryStorage(), networkconfig.MainnetChainID)
	if err != nil {
		t.Fatal(err)
	}
	err = chain.validateBlock(&Block{Header: Header{ChainID: networkconfig.TestnetChainID}})
	if err == nil || !errors.Is(err, errors.New("wrong chain ID")) {
		if err == nil || err.Error() != fmt.Sprintf("wrong chain ID: expected %d, got %d", networkconfig.MainnetChainID, networkconfig.TestnetChainID) {
			t.Fatalf("wrong-network block was not rejected clearly: %v", err)
		}
	}
}
