package utils

import (
	"encoding/hex"

	"golang.org/x/crypto/sha3"
)

// Keccak256 computes the Keccak-256 hash of data
func Keccak256(data []byte) []byte {
	h := sha3.NewLegacyKeccak256()
	h.Write(data)
	return h.Sum(nil)
}

// Keccak256Hex returns the Keccak-256 hash as a 0x-prefixed hex string
func Keccak256Hex(data []byte) string {
	return "0x" + hex.EncodeToString(Keccak256(data))
}

// SHA3256 computes the SHA3-256 hash
func SHA3256(data []byte) []byte {
	h := sha3.New256()
	h.Write(data)
	return h.Sum(nil)
}

// DoubleKeccak256 applies Keccak-256 twice (for extra security in certain contexts)
func DoubleKeccak256(data []byte) []byte {
	return Keccak256(Keccak256(data))
}
