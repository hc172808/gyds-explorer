package utils

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math/big"
)

// GenerateKeyPair generates a new ECDSA key pair using secp256k1-compatible curve
func GenerateKeyPair() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}

// PubKeyToAddress converts a public key to a GYDS address (0x-prefixed, 20 bytes)
func PubKeyToAddress(pub *ecdsa.PublicKey) string {
	pubBytes := elliptic.Marshal(pub.Curve, pub.X, pub.Y)
	hash := Keccak256(pubBytes[1:]) // Skip 0x04 prefix
	return "0x" + hex.EncodeToString(hash[12:]) // Last 20 bytes
}

// SignData signs data with a private key
func SignData(privKey *ecdsa.PrivateKey, data []byte) (string, error) {
	hash := Keccak256(data)
	r, s, err := ecdsa.Sign(rand.Reader, privKey, hash)
	if err != nil {
		return "", err
	}
	// Encode r and s as hex
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	sig := make([]byte, 64)
	copy(sig[32-len(rBytes):32], rBytes)
	copy(sig[64-len(sBytes):64], sBytes)
	return "0x" + hex.EncodeToString(sig), nil
}

// VerifySignature verifies an ECDSA signature
func VerifySignature(pubKey *ecdsa.PublicKey, data []byte, sigHex string) (bool, error) {
	if len(sigHex) < 130 { // 0x + 128 hex chars
		return false, errors.New("invalid signature length")
	}
	sigBytes, err := hex.DecodeString(sigHex[2:])
	if err != nil {
		return false, err
	}
	if len(sigBytes) != 64 {
		return false, errors.New("invalid signature format")
	}

	r := new(big.Int).SetBytes(sigBytes[:32])
	s := new(big.Int).SetBytes(sigBytes[32:])
	hash := Keccak256(data)

	return ecdsa.Verify(pubKey, hash, r, s), nil
}

// PrivateKeyToHex exports a private key as hex string
func PrivateKeyToHex(key *ecdsa.PrivateKey) string {
	return hex.EncodeToString(key.D.Bytes())
}
