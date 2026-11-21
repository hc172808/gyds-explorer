package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/guardian-chain/blockchain-go/internal/blockchain"
	"github.com/guardian-chain/blockchain-go/internal/network"
	"github.com/guardian-chain/blockchain-go/internal/networkconfig"
)

func main() {
	networkName := flag.String("network", "", "Required network identity: mainnet or testnet")
	listenAddr := flag.String("listen", ":30304", "P2P listen address")
	bootstrap := flag.String("bootstrap", "", "Bootstrap full node address (host:port)")
	flag.Parse()

	networkConfig, err := networkconfig.Parse(*networkName)
	if err != nil {
		log.Fatal(err)
	}
	if *bootstrap == "" {
		log.Fatal("Lite node requires a bootstrap node. Use --bootstrap flag.")
	}
	genesisHash, err := blockchain.ExpectedGenesisHash(networkConfig.ChainID)
	if err != nil {
		log.Fatal(err)
	}

	// Lite node only syncs headers and validates proofs
	p2p, err := network.NewP2PNode(*listenAddr, networkConfig.ChainID, genesisHash)
	if err != nil {
		log.Fatalf("Failed to initialize P2P network: %v", err)
	}

	var latestBlockNum uint64

	p2p.RegisterHandler(network.MsgBlock, func(data []byte, peer *network.Peer) {
		block, err := blockchain.DeserializeBlock(data)
		if err != nil {
			log.Printf("Invalid block header from %s: %v", peer.Addr, err)
			return
		}
		if block.Header.ChainID != networkConfig.ChainID {
			log.Printf("Rejected header from %s: wrong chain ID %d, expected %d", peer.Addr, block.Header.ChainID, networkConfig.ChainID)
			return
		}
		if block.Header.Number > latestBlockNum {
			latestBlockNum = block.Header.Number
			log.Printf("Lite node: synced header #%d hash=%s", block.Header.Number, block.Header.Hash)
		}
	})

	// Connect to full node
	if err := p2p.Connect(*bootstrap); err != nil {
		log.Fatalf("Failed to connect to bootstrap node: %v", err)
	}

	go func() {
		if err := p2p.Start(); err != nil {
			log.Fatalf("P2P failed: %v", err)
		}
	}()

	fmt.Printf("Guardian Chain Lite Node started\n")
	fmt.Printf("  Network:  %s\n", networkConfig.Name)
	fmt.Printf("  Chain ID: %d\n", networkConfig.ChainID)
	fmt.Printf("  P2P:       %s\n", *listenAddr)
	fmt.Printf("  Bootstrap: %s\n", *bootstrap)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	fmt.Println("\nShutting down lite node...")
	p2p.Stop()
}
