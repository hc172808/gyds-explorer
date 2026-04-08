package database

// Storage defines the generic key-value storage interface
// All blockchain persistence layers must implement this interface
type Storage interface {
	// Get retrieves a value by key. Returns nil, nil if key doesn't exist.
	Get(key []byte) ([]byte, error)

	// Put stores a key-value pair
	Put(key []byte, value []byte) error

	// Delete removes a key-value pair
	Delete(key []byte) error

	// Has checks if a key exists
	Has(key []byte) (bool, error)

	// BatchPut writes multiple key-value pairs atomically
	BatchPut(pairs map[string][]byte) error

	// Iterator creates an iterator over a key prefix
	Iterator(prefix []byte) Iterator

	// Close releases resources
	Close() error
}

// Iterator provides sequential access to key-value pairs
type Iterator interface {
	// Next advances to the next entry. Returns false when exhausted.
	Next() bool

	// Key returns the current key
	Key() []byte

	// Value returns the current value
	Value() []byte

	// Release frees iterator resources
	Release()
}
