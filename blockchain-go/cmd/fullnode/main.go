package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/guardian-chain/blockchain-go/explorer"
	"github.com/guardian-chain/blockchain-go/internal/blockchain"
	"github.com/guardian-chain/blockchain-go/internal/consensus"
	"github.com/guardian-chain/blockchain-go/internal/database"
	"github.com/guardian-chain/blockchain-go/internal/indexer"
	"github.com/guardian-chain/blockchain-go/internal/network"
)

func main() {
	dataDir := flag.String("datadir", "./data", "Data directory for blockchain storage")
	listenAddr := flag.String("listen", ":30303", "P2P listen address")
	apiAddr := flag.String("api", ":8545", "Explorer API listen address")
	bootstrap := flag.String("bootstrap", "", "Bootstrap node address (host:port)")
	minerAddr := flag.String("miner", "", "Miner/validator GYDS address for rewards")
	flag.Parse()

	// Initialize database
	db, err := database.NewLevelDB(*dataDir + "/chaindata")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Initialize blockchain
	chain, err := blockchain.NewBlockchain(db)
	if err != nil {
		log.Fatalf("Failed to initialize blockchain: %v", err)
	}

	// Initialize consensus engine
	pos := consensus.NewProofOfStake(chain.State())

	// Initialize P2P network
	p2p := network.NewP2PNode(*listenAddr)

	// Register message handlers
	p2p.RegisterHandler(network.MsgBlock, func(data []byte, peer *network.Peer) {
		block, err := blockchain.DeserializeBlock(data)
		if err != nil {
			log.Printf("Invalid block from %s: %v", peer.Addr, err)
			return
		}
		if err := chain.AddBlock(block); err != nil {
			log.Printf("Failed to add block: %v", err)
			return
		}
		log.Printf("Added block #%d from peer %s", block.Header.Number, peer.Addr)
	})

	p2p.RegisterHandler(network.MsgTx, func(data []byte, peer *network.Peer) {
		tx, err := blockchain.DeserializeTx(data)
		if err != nil {
			log.Printf("Invalid tx from %s: %v", peer.Addr, err)
			return
		}
		if err := chain.AddPendingTx(tx); err != nil {
			log.Printf("Failed to add tx: %v", err)
			return
		}
	})

	// Connect to bootstrap node
	if *bootstrap != "" {
		if err := p2p.Connect(*bootstrap); err != nil {
			log.Printf("Warning: failed to connect to bootstrap node %s: %v", *bootstrap, err)
		}
	}

	// Start P2P
	go func() {
		if err := p2p.Start(); err != nil {
			log.Fatalf("P2P failed: %v", err)
		}
	}()

	// Initialize indexer
	idx := indexer.NewIndexer(db, chain)
	go idx.Start()

	// Start explorer API
	explorerServer := explorer.NewServer(chain, idx, *apiAddr)
	go func() {
		if err := explorerServer.Start(); err != nil {
			log.Fatalf("Explorer API failed: %v", err)
		}
	}()

	// Start mining if miner address is set
	if *minerAddr != "" {
		miner := blockchain.NewMiner(chain, pos, *minerAddr)
		go miner.Start(func(block *blockchain.Block) {
			data, _ := blockchain.SerializeBlock(block)
			p2p.Broadcast(network.MsgBlock, data)
		})
		log.Printf("Mining enabled for address: %s", *minerAddr)
	}

	fmt.Printf("Guardian Chain Full Node started\n")
	fmt.Printf("  P2P:      %s\n", *listenAddr)
	fmt.Printf("  API:      %s\n", *apiAddr)
	fmt.Printf("  Data:     %s\n", *dataDir)

	// Wait for shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	fmt.Println("\nShutting down...")
	p2p.Stop()
	idx.Stop()
}
