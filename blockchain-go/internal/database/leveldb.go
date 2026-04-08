package database

import (
	"github.com/syndtr/goleveldb/leveldb"
	"github.com/syndtr/goleveldb/leveldb/util"
)

// LevelDB implements the Storage interface using LevelDB
type LevelDB struct {
	db *leveldb.DB
}

// NewLevelDB opens or creates a LevelDB database at the given path
func NewLevelDB(path string) (*LevelDB, error) {
	db, err := leveldb.OpenFile(path, nil)
	if err != nil {
		return nil, err
	}
	return &LevelDB{db: db}, nil
}

func (l *LevelDB) Get(key []byte) ([]byte, error) {
	data, err := l.db.Get(key, nil)
	if err == leveldb.ErrNotFound {
		return nil, nil
	}
	return data, err
}

func (l *LevelDB) Put(key []byte, value []byte) error {
	return l.db.Put(key, value, nil)
}

func (l *LevelDB) Delete(key []byte) error {
	return l.db.Delete(key, nil)
}

func (l *LevelDB) Has(key []byte) (bool, error) {
	return l.db.Has(key, nil)
}

func (l *LevelDB) BatchPut(pairs map[string][]byte) error {
	batch := new(leveldb.Batch)
	for k, v := range pairs {
		batch.Put([]byte(k), v)
	}
	return l.db.Write(batch, nil)
}

func (l *LevelDB) Iterator(prefix []byte) Iterator {
	iter := l.db.NewIterator(util.BytesPrefix(prefix), nil)
	return &levelDBIterator{iter: iter}
}

func (l *LevelDB) Close() error {
	return l.db.Close()
}

// levelDBIterator wraps the LevelDB iterator
type levelDBIterator struct {
	iter *leveldb.Iterator
}

func (it *levelDBIterator) Next() bool {
	return (*it.iter).Next()
}

func (it *levelDBIterator) Key() []byte {
	return (*it.iter).Key()
}

func (it *levelDBIterator) Value() []byte {
	return (*it.iter).Value()
}

func (it *levelDBIterator) Release() {
	(*it.iter).Release()
}
