package utils

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
)

// This archived Go chain uses Go's standard P-256 curve and its own address
// scheme. It is not compatible with Ethereum/secp256k1 wallet signatures.
const p256CurveName = "P-256"

// GenerateKeyPair generates a P-256 key pair for the custom Go-chain format.
func GenerateKeyPair() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}

// PublicKeyToHex encodes a valid P-256 public key in uncompressed SEC1 form.
func PublicKeyToHex(pub *ecdsa.PublicKey) (string, error) {
	if !isP256PublicKey(pub) {
		return "", errors.New("public key must be a valid P-256 point")
	}
	return "0x" + hex.EncodeToString(elliptic.Marshal(elliptic.P256(), pub.X, pub.Y)), nil
}

// PublicKeyFromHex parses an uncompressed P-256 SEC1 public key.
func PublicKeyFromHex(value string) (*ecdsa.PublicKey, error) {
	if !strings.HasPrefix(value, "0x") {
		return nil, errors.New("public key must use 0x-prefixed SEC1 encoding")
	}
	encoded, err := hex.DecodeString(value[2:])
	if err != nil {
		return nil, fmt.Errorf("invalid public key hex: %w", err)
	}
	if len(encoded) != 65 || encoded[0] != 0x04 {
		return nil, errors.New("public key must be a 65-byte uncompressed SEC1 point")
	}
	x, y := elliptic.Unmarshal(elliptic.P256(), encoded)
	if x == nil || y == nil {
		return nil, errors.New("public key is not a valid P-256 point")
	}
	return &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, nil
}

// PubKeyToAddress derives a custom Go-chain address as the final 20 bytes of
// Keccak-256 over the uncompressed P-256 point without its 0x04 prefix. It is
// intentionally not described as an Ethereum address.
func PubKeyToAddress(pub *ecdsa.PublicKey) string {
	if !isP256PublicKey(pub) {
		return ""
	}
	pubBytes := elliptic.Marshal(elliptic.P256(), pub.X, pub.Y)
	hash := Keccak256(pubBytes[1:])             // Skip 0x04 prefix
	return "0x" + hex.EncodeToString(hash[12:]) // Last 20 bytes
}

// SignData signs data with P-256 ECDSA and returns canonical fixed-width r||s.
func SignData(privKey *ecdsa.PrivateKey, data []byte) (string, error) {
	if privKey == nil || privKey.Curve != elliptic.P256() || privKey.Curve.Params().Name != p256CurveName ||
		privKey.D == nil || privKey.D.Sign() <= 0 || privKey.D.Cmp(privKey.Curve.Params().N) >= 0 ||
		privKey.X == nil || privKey.Y == nil {
		return "", errors.New("private key must be a valid P-256 key")
	}
	expectedX, expectedY := privKey.Curve.ScalarBaseMult(privKey.D.Bytes())
	if expectedX.Cmp(privKey.X) != 0 || expectedY.Cmp(privKey.Y) != 0 {
		return "", errors.New("private key public point does not match its scalar")
	}
	hash := Keccak256(data)
	r, s, err := ecdsa.Sign(rand.Reader, privKey, hash)
	if err != nil {
		return "", err
	}
	// Enforce low-S signatures to give each signed payload one canonical form.
	halfOrder := new(big.Int).Rsh(new(big.Int).Set(privKey.Curve.Params().N), 1)
	if s.Cmp(halfOrder) > 0 {
		s.Sub(privKey.Curve.Params().N, s)
	}
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	sig := make([]byte, 64)
	copy(sig[32-len(rBytes):32], rBytes)
	copy(sig[64-len(sBytes):64], sBytes)
	return "0x" + hex.EncodeToString(sig), nil
}

// VerifySignature verifies a low-S, fixed-width P-256 ECDSA signature.
func VerifySignature(pubKey *ecdsa.PublicKey, data []byte, sigHex string) (bool, error) {
	if !isP256PublicKey(pubKey) {
		return false, errors.New("public key must be a valid P-256 point")
	}
	if len(sigHex) != 130 || !strings.HasPrefix(sigHex, "0x") {
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
	order := pubKey.Curve.Params().N
	if r.Sign() <= 0 || r.Cmp(order) >= 0 || s.Sign() <= 0 || s.Cmp(order) >= 0 {
		return false, errors.New("signature values are outside the P-256 order")
	}
	halfOrder := new(big.Int).Rsh(new(big.Int).Set(order), 1)
	if s.Cmp(halfOrder) > 0 {
		return false, errors.New("signature is not canonical low-S")
	}
	hash := Keccak256(data)

	return ecdsa.Verify(pubKey, hash, r, s), nil
}

func isP256PublicKey(pub *ecdsa.PublicKey) bool {
	return pub != nil &&
		pub.Curve == elliptic.P256() &&
		pub.Curve.Params().Name == p256CurveName &&
		pub.X != nil &&
		pub.Y != nil &&
		elliptic.P256().IsOnCurve(pub.X, pub.Y)
}

// PrivateKeyToHex exports a private key as hex string
func PrivateKeyToHex(key *ecdsa.PrivateKey) string {
	return hex.EncodeToString(key.D.Bytes())
}
