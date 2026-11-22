package network

import (
	"encoding/binary"
	"net"
	"strings"
	"testing"

	"github.com/guardian-chain/blockchain-go/internal/networkconfig"
)

const testGenesisHash = "0x0000000000000000000000000000000000000000000000000000000000000001"

func testNode(t *testing.T, chainID uint64, genesisHash string) *P2PNode {
	t.Helper()
	node, err := NewP2PNode("127.0.0.1:0", chainID, genesisHash)
	if err != nil {
		t.Fatal(err)
	}
	return node
}

func runHandshakePair(t *testing.T, initiator, responder *P2PNode) (error, error) {
	t.Helper()
	left, right := net.Pipe()
	t.Cleanup(func() {
		left.Close()
		right.Close()
	})

	initiatorResult := make(chan error, 1)
	responderResult := make(chan error, 1)
	go func() { initiatorResult <- initiator.performHandshake(left, true) }()
	go func() { responderResult <- responder.performHandshake(right, false) }()
	return <-initiatorResult, <-responderResult
}

func TestHandshakeAcceptsMatchingChainAndGenesis(t *testing.T) {
	mainnetA := testNode(t, networkconfig.MainnetChainID, testGenesisHash)
	mainnetB := testNode(t, networkconfig.MainnetChainID, testGenesisHash)
	initiatorErr, responderErr := runHandshakePair(t, mainnetA, mainnetB)
	if initiatorErr != nil || responderErr != nil {
		t.Fatalf("matching peers rejected: initiator=%v responder=%v", initiatorErr, responderErr)
	}
}

func TestHandshakeRejectsWrongChainID(t *testing.T) {
	mainnet := testNode(t, networkconfig.MainnetChainID, testGenesisHash)
	testnet := testNode(t, networkconfig.TestnetChainID, testGenesisHash)
	initiatorErr, responderErr := runHandshakePair(t, mainnet, testnet)
	if initiatorErr == nil || responderErr == nil {
		t.Fatalf("wrong-chain peer accepted: initiator=%v responder=%v", initiatorErr, responderErr)
	}
	if !strings.Contains(initiatorErr.Error(), "wrong chain ID") {
		t.Fatalf("initiator did not receive a clear chain mismatch: %v", initiatorErr)
	}
}

func TestHandshakeRejectsDifferentGenesis(t *testing.T) {
	mainnet := testNode(t, networkconfig.MainnetChainID, testGenesisHash)
	forked := testNode(t, networkconfig.MainnetChainID, "0x0000000000000000000000000000000000000000000000000000000000000002")
	initiatorErr, responderErr := runHandshakePair(t, mainnet, forked)
	if initiatorErr == nil || responderErr == nil {
		t.Fatalf("different-genesis peer accepted: initiator=%v responder=%v", initiatorErr, responderErr)
	}
	if !strings.Contains(initiatorErr.Error(), "different genesis hash") {
		t.Fatalf("initiator did not receive a clear genesis mismatch: %v", initiatorErr)
	}
}

func TestP2PNodeRejectsUnsupportedIdentity(t *testing.T) {
	if _, err := NewP2PNode("127.0.0.1:0", 1, testGenesisHash); err == nil {
		t.Fatal("unsupported chain ID must fail")
	}
	if _, err := NewP2PNode("127.0.0.1:0", networkconfig.MainnetChainID, "0xnot-a-hash"); err == nil {
		t.Fatal("malformed genesis hash must fail")
	}
}

func TestReadFrameRejectsOversizedMessage(t *testing.T) {
	frame := make([]byte, 5)
	binary.BigEndian.PutUint32(frame[1:], maxMessageSize+1)
	if _, _, err := readFrame(strings.NewReader(string(frame))); err == nil {
		t.Fatal("oversized frame must be rejected before allocation")
	}
}

func TestDecodeHandshakeRejectsUnknownFieldsAndTrailingJSON(t *testing.T) {
	if _, err := decodeHandshake([]byte(`{"protocolVersion":1,"chainId":198282,"genesisHash":"` + testGenesisHash + `","response":false,"unexpected":true}`)); err == nil {
		t.Fatal("unknown handshake field must fail")
	}
	if _, err := decodeHandshake([]byte(`{"protocolVersion":1,"chainId":198282,"genesisHash":"` + testGenesisHash + `","response":false} {}`)); err == nil {
		t.Fatal("trailing JSON must fail")
	}
}
