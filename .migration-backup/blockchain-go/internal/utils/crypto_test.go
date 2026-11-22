package utils

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"
)

func TestP256SignVerifyAndPublicKeyEncoding(t *testing.T) {
	privateKey, err := GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	if privateKey.Curve != elliptic.P256() {
		t.Fatal("Go-chain key generation must use P-256")
	}

	publicKeyHex, err := PublicKeyToHex(&privateKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	parsedPublicKey, err := PublicKeyFromHex(publicKeyHex)
	if err != nil {
		t.Fatal(err)
	}
	if PubKeyToAddress(parsedPublicKey) != PubKeyToAddress(&privateKey.PublicKey) {
		t.Fatal("public key encoding changed the derived Go-chain address")
	}

	message := []byte("guardian-chain-transaction-v1:198282")
	signature, err := SignData(privateKey, message)
	if err != nil {
		t.Fatal(err)
	}
	valid, err := VerifySignature(parsedPublicKey, message, signature)
	if err != nil || !valid {
		t.Fatalf("valid P-256 signature rejected: valid=%v err=%v", valid, err)
	}
	valid, err = VerifySignature(parsedPublicKey, []byte("different chain"), signature)
	if err != nil {
		t.Fatal(err)
	}
	if valid {
		t.Fatal("signature verified for a different signing payload")
	}
}

func TestVerifySignatureRejectsHighSAndMalformedKeys(t *testing.T) {
	privateKey, err := GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	message := []byte("canonical signature")
	signature, err := SignData(privateKey, message)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := hex.DecodeString(strings.TrimPrefix(signature, "0x"))
	if err != nil {
		t.Fatal(err)
	}
	s := new(big.Int).SetBytes(decoded[32:])
	highS := new(big.Int).Sub(privateKey.Curve.Params().N, s)
	highS.FillBytes(decoded[32:])
	if _, err := VerifySignature(&privateKey.PublicKey, message, "0x"+hex.EncodeToString(decoded)); err == nil {
		t.Fatal("high-S signature must be rejected as non-canonical")
	}
	if _, err := PublicKeyFromHex("0x04"); err == nil {
		t.Fatal("short public key must be rejected")
	}
	if _, err := VerifySignature(&privateKey.PublicKey, message, "0x1234"); err == nil {
		t.Fatal("short signature must be rejected")
	}
}

func TestP256HelpersRejectOtherCurves(t *testing.T) {
	otherKey, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := PublicKeyToHex(&otherKey.PublicKey); err == nil {
		t.Fatal("P-384 public key must not be encoded as a Go-chain P-256 key")
	}
	if address := PubKeyToAddress(&otherKey.PublicKey); address != "" {
		t.Fatalf("unexpected address from a different curve: %s", address)
	}
}
