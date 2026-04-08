package explorer

import (
	"log"
	"net/http"

	"github.com/guardian-chain/blockchain-go/internal/blockchain"
	"github.com/guardian-chain/blockchain-go/internal/indexer"
)

// Server hosts the Explorer HTTP API
type Server struct {
	chain   *blockchain.Blockchain
	indexer *indexer.Indexer
	addr    string
	mux     *http.ServeMux
}

// NewServer creates a new explorer API server
func NewServer(chain *blockchain.Blockchain, idx *indexer.Indexer, addr string) *Server {
	s := &Server{
		chain:   chain,
		indexer: idx,
		addr:    addr,
		mux:     http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("/api/block/", s.handleGetBlock)
	s.mux.HandleFunc("/api/block-by-number/", s.handleGetBlockByNumber)
	s.mux.HandleFunc("/api/tx/", s.handleGetTransaction)
	s.mux.HandleFunc("/api/account/", s.handleGetAccount)
	s.mux.HandleFunc("/api/latest", s.handleLatest)
	s.mux.HandleFunc("/api/pending", s.handlePendingTxs)
	s.mux.HandleFunc("/api/status", s.handleStatus)
}

// Start begins serving HTTP requests
func (s *Server) Start() error {
	log.Printf("Explorer API listening on %s", s.addr)
	return http.ListenAndServe(s.addr, corsMiddleware(s.mux))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
