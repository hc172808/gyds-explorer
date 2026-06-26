package network

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"
)

// Message types
const (
	MsgBlock     byte = 0x01
	MsgTx        byte = 0x02
	MsgPeerList  byte = 0x03
	MsgPing      byte = 0x04
	MsgPong      byte = 0x05
	MsgGetBlocks byte = 0x06
)

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
	listener     net.Listener
	peers        map[string]*Peer
	handlers     map[byte]MessageHandler
	maxPeers     int
	running      bool
	stopCh       chan struct{}
}

// NewP2PNode creates a new P2P network node
func NewP2PNode(listenAddr string) *P2PNode {
	return &P2PNode{
		listenAddr: listenAddr,
		peers:      make(map[string]*Peer),
		handlers:   make(map[byte]MessageHandler),
		maxPeers:   50,
		stopCh:     make(chan struct{}),
	}
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

		peer := &Peer{
			Addr: conn.RemoteAddr().String(),
			conn: conn,
		}

		n.addPeer(peer)
		go n.handlePeer(peer)
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

	peer := &Peer{
		Addr: addr,
		conn: conn,
	}

	n.addPeer(peer)
	go n.handlePeer(peer)
	log.Printf("Connected to peer: %s", addr)
	return nil
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

func (n *P2PNode) addPeer(peer *Peer) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if len(n.peers) >= n.maxPeers {
		log.Printf("Max peers reached, rejecting %s", peer.Addr)
		peer.conn.Close()
		return
	}

	n.peers[peer.Addr] = peer
	log.Printf("Peer connected: %s (total: %d)", peer.Addr, len(n.peers))
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

		// Read message: [type:1][length:4][data:N]
		header := make([]byte, 5)
		peer.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		if _, err := io.ReadFull(peer.conn, header); err != nil {
			if !peer.closing {
				log.Printf("Read error from %s: %v", peer.Addr, err)
			}
			return
		}

		msgType := header[0]
		length := binary.BigEndian.Uint32(header[1:5])

		if length > 10*1024*1024 { // 10MB max
			log.Printf("Message too large from %s: %d bytes", peer.Addr, length)
			return
		}

		data := make([]byte, length)
		if _, err := io.ReadFull(peer.conn, data); err != nil {
			log.Printf("Data read error from %s: %v", peer.Addr, err)
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

	msg := make([]byte, 5+len(data))
	msg[0] = msgType
	binary.BigEndian.PutUint32(msg[1:5], uint32(len(data)))
	copy(msg[5:], data)

	peer.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_, err := peer.conn.Write(msg)
	return err
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
