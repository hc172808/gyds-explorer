package network

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/guardian-chain/blockchain-go/internal/networkconfig"
)

// Message types
const (
	MsgHandshake byte = 0x00
	MsgBlock     byte = 0x01
	MsgTx        byte = 0x02
	MsgPeerList  byte = 0x03
	MsgPing      byte = 0x04
	MsgPong      byte = 0x05
	MsgGetBlocks byte = 0x06
)

const (
	protocolVersion  = 1
	maxMessageSize   = 10 * 1024 * 1024
	handshakeTimeout = 5 * time.Second
)

type handshakeMessage struct {
	ProtocolVersion uint32 `json:"protocolVersion"`
	ChainID         uint64 `json:"chainId"`
	GenesisHash     string `json:"genesisHash"`
	Response        bool   `json:"response"`
	Error           string `json:"error,omitempty"`
}

// Peer represents a connected network peer
type Peer struct {
	Addr    string
	conn    net.Conn
	mu      sync.Mutex
	closing bool
}

// MessageHandler processes incoming messages from peers
type MessageHandler func(data []byte, peer *Peer)

// P2PNode manages peer-to-peer networking
type P2PNode struct {
	mu           sync.RWMutex
	listenAddr   string
	chainID      uint64
	genesisHash  string
	listener     net.Listener
	peers        map[string]*Peer
	handlers     map[byte]MessageHandler
	maxPeers     int
	running      bool
	stopCh       chan struct{}
}

// NewP2PNode creates a node that only peers with the same chain ID and genesis
// hash can join. This is a custom protocol, not Ethereum devp2p.
func NewP2PNode(listenAddr string, chainID uint64, genesisHash string) (*P2PNode, error) {
	if _, err := networkconfig.FromChainID(chainID); err != nil {
		return nil, err
	}
	if !isHash(genesisHash) {
		return nil, errors.New("genesis hash must be a 32-byte 0x-prefixed hex value")
	}
	return &P2PNode{
		listenAddr:  listenAddr,
		chainID:     chainID,
		genesisHash: strings.ToLower(genesisHash),
		peers:       make(map[string]*Peer),
		handlers:    make(map[byte]MessageHandler),
		maxPeers:    50,
		stopCh:      make(chan struct{}),
	}, nil
}

// RegisterHandler registers a handler for a specific message type
func (n *P2PNode) RegisterHandler(msgType byte, handler MessageHandler) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.handlers[msgType] = handler
}

// Start begins listening for incoming connections
func (n *P2PNode) Start() error {
	var err error
	n.listener, err = net.Listen("tcp", n.listenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", n.listenAddr, err)
	}

	n.running = true
	log.Printf("P2P listening on %s", n.listenAddr)

	// Start peer discovery loop
	go n.discoveryLoop()

	for {
		conn, err := n.listener.Accept()
		if err != nil {
			select {
			case <-n.stopCh:
				return nil
			default:
				log.Printf("Accept error: %v", err)
				continue
			}
		}

		go n.acceptPeer(conn)
	}
}

// Stop shuts down the P2P node
func (n *P2PNode) Stop() {
	n.running = false
	close(n.stopCh)
	if n.listener != nil {
		n.listener.Close()
	}
	n.mu.Lock()
	for _, peer := range n.peers {
		peer.conn.Close()
	}
	n.mu.Unlock()
}

// Connect establishes a connection to a remote peer
func (n *P2PNode) Connect(addr string) error {
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", addr, err)
	}
	if err := n.performHandshake(conn, true); err != nil {
		conn.Close()
		return fmt.Errorf("peer %s handshake failed: %w", addr, err)
	}

	peer := &Peer{
		Addr: addr,
		conn: conn,
	}

	if err := n.addPeer(peer); err != nil {
		return err
	}
	go n.handlePeer(peer)
	log.Printf("Connected to peer: %s", addr)
	return nil
}

func (n *P2PNode) acceptPeer(conn net.Conn) {
	addr := conn.RemoteAddr().String()
	if err := n.performHandshake(conn, false); err != nil {
		log.Printf("Rejected peer %s: %v", addr, err)
		conn.Close()
		return
	}
	peer := &Peer{Addr: addr, conn: conn}
	if err := n.addPeer(peer); err != nil {
		log.Printf("Rejected peer %s: %v", addr, err)
		return
	}
	log.Printf("Peer handshake accepted: %s (chain %d)", addr, n.chainID)
	go n.handlePeer(peer)
}

// Broadcast sends a message to all connected peers
func (n *P2PNode) Broadcast(msgType byte, data []byte) {
	n.mu.RLock()
	defer n.mu.RUnlock()

	for _, peer := range n.peers {
		go func(p *Peer) {
			if err := n.sendMessage(p, msgType, data); err != nil {
				log.Printf("Broadcast to %s failed: %v", p.Addr, err)
			}
		}(peer)
	}
}

// PeerCount returns the number of connected peers
func (n *P2PNode) PeerCount() int {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return len(n.peers)
}

func (n *P2PNode) addPeer(peer *Peer) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if !n.running && n.listener != nil {
		peer.conn.Close()
		return errors.New("P2P node is stopping")
	}
	if _, exists := n.peers[peer.Addr]; exists {
		peer.conn.Close()
		return fmt.Errorf("peer %s is already connected", peer.Addr)
	}
	if len(n.peers) >= n.maxPeers {
		log.Printf("Max peers reached, rejecting %s", peer.Addr)
		peer.conn.Close()
		return errors.New("maximum peer count reached")
	}

	n.peers[peer.Addr] = peer
	log.Printf("Peer connected: %s (total: %d)", peer.Addr, len(n.peers))
	return nil
}

func (n *P2PNode) removePeer(addr string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if peer, ok := n.peers[addr]; ok {
		peer.closing = true
		peer.conn.Close()
		delete(n.peers, addr)
		log.Printf("Peer disconnected: %s (total: %d)", addr, len(n.peers))
	}
}

func (n *P2PNode) handlePeer(peer *Peer) {
	defer n.removePeer(peer.Addr)

	for {
		select {
		case <-n.stopCh:
			return
		default:
		}

		peer.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		msgType, data, err := readFrame(peer.conn)
		if err != nil {
			if !peer.closing {
				log.Printf("Read error from %s: %v", peer.Addr, err)
			}
			return
		}

		// Handle ping/pong internally
		if msgType == MsgPing {
			n.sendMessage(peer, MsgPong, []byte("pong"))
			continue
		}

		// Dispatch to registered handler
		n.mu.RLock()
		handler, exists := n.handlers[msgType]
		n.mu.RUnlock()

		if exists {
			go handler(data, peer)
		}
	}
}

func (n *P2PNode) sendMessage(peer *Peer, msgType byte, data []byte) error {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	peer.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return writeFrame(peer.conn, msgType, data)
}

func (n *P2PNode) discoveryLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-n.stopCh:
			return
		case <-ticker.C:
			// Request peer lists from connected peers
			n.mu.RLock()
			for _, peer := range n.peers {
				go n.sendMessage(peer, MsgPeerList, []byte("request"))
			}
			n.mu.RUnlock()
		}
	}
}

func (n *P2PNode) performHandshake(conn net.Conn, initiator bool) error {
	if err := conn.SetDeadline(time.Now().Add(handshakeTimeout)); err != nil {
		return fmt.Errorf("set handshake deadline: %w", err)
	}
	defer conn.SetDeadline(time.Time{})

	local := handshakeMessage{
		ProtocolVersion: protocolVersion,
		ChainID:         n.chainID,
		GenesisHash:     n.genesisHash,
	}
	if initiator {
		payload, _ := json.Marshal(local)
		if err := writeFrame(conn, MsgHandshake, payload); err != nil {
			return fmt.Errorf("send handshake: %w", err)
		}
		msgType, responseBytes, err := readFrame(conn)
		if err != nil {
			return fmt.Errorf("read handshake response: %w", err)
		}
		if msgType != MsgHandshake {
			return fmt.Errorf("expected handshake response, received message type 0x%02x", msgType)
		}
		remote, err := decodeHandshake(responseBytes)
		if err != nil {
			return err
		}
		if !remote.Response {
			return errors.New("peer did not return a handshake response")
		}
		if remote.Error != "" {
			return errors.New(remote.Error)
		}
		return n.validateHandshake(remote)
	}

	msgType, requestBytes, err := readFrame(conn)
	if err != nil {
		return fmt.Errorf("read handshake request: %w", err)
	}
	if msgType != MsgHandshake {
		return n.rejectHandshake(conn, fmt.Errorf("expected initial handshake, received message type 0x%02x", msgType))
	}
	remote, err := decodeHandshake(requestBytes)
	if err != nil {
		return n.rejectHandshake(conn, err)
	}
	if remote.Response {
		return n.rejectHandshake(conn, errors.New("peer sent a response where an initial handshake was required"))
	}
	if err := n.validateHandshake(remote); err != nil {
		return n.rejectHandshake(conn, err)
	}
	local.Response = true
	payload, _ := json.Marshal(local)
	return writeFrame(conn, MsgHandshake, payload)
}

func (n *P2PNode) validateHandshake(remote handshakeMessage) error {
	if remote.ProtocolVersion != protocolVersion {
		return fmt.Errorf("unsupported P2P protocol version %d", remote.ProtocolVersion)
	}
	if remote.ChainID != n.chainID {
		return fmt.Errorf("wrong chain ID: expected %d, got %d", n.chainID, remote.ChainID)
	}
	if !strings.EqualFold(remote.GenesisHash, n.genesisHash) {
		return errors.New("peer has a different genesis hash")
	}
	return nil
}

func (n *P2PNode) rejectHandshake(conn net.Conn, cause error) error {
	response := handshakeMessage{
		ProtocolVersion: protocolVersion,
		ChainID:         n.chainID,
		GenesisHash:     n.genesisHash,
		Response:        true,
		Error:           cause.Error(),
	}
	payload, err := json.Marshal(response)
	if err == nil {
		_ = writeFrame(conn, MsgHandshake, payload)
	}
	return cause
}

func decodeHandshake(data []byte) (handshakeMessage, error) {
	var message handshakeMessage
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&message); err != nil {
		return handshakeMessage{}, fmt.Errorf("invalid P2P handshake: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return handshakeMessage{}, errors.New("invalid P2P handshake: unexpected trailing data")
	}
	return message, nil
}

func readFrame(reader io.Reader) (byte, []byte, error) {
	header := make([]byte, 5)
	if _, err := io.ReadFull(reader, header); err != nil {
		return 0, nil, err
	}
	length := binary.BigEndian.Uint32(header[1:5])
	if length > maxMessageSize {
		return 0, nil, fmt.Errorf("message too large: %d bytes", length)
	}
	data := make([]byte, int(length))
	if _, err := io.ReadFull(reader, data); err != nil {
		return 0, nil, err
	}
	return header[0], data, nil
}

func writeFrame(writer io.Writer, msgType byte, data []byte) error {
	if len(data) > maxMessageSize {
		return fmt.Errorf("message too large: %d bytes", len(data))
	}
	frame := make([]byte, 5+len(data))
	frame[0] = msgType
	binary.BigEndian.PutUint32(frame[1:5], uint32(len(data)))
	copy(frame[5:], data)
	for len(frame) > 0 {
		written, err := writer.Write(frame)
		if err != nil {
			return err
		}
		if written == 0 {
			return io.ErrShortWrite
		}
		frame = frame[written:]
	}
	return nil
}

func isHash(value string) bool {
	if len(value) != 66 || !strings.HasPrefix(value, "0x") {
		return false
	}
	_, err := hex.DecodeString(value[2:])
	return err == nil
}
