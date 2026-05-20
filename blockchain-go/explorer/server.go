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
	s.mux.HandleFunc("/health", s.handleHealth)
}

// handleHealth responds with a 200 status for liveness/readiness probes
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	num, hash := s.chain.LatestBlock()
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "ok",
		"service":     "guardian-explorer-api",
		"chainHeight": num,
		"latestHash":  hash,
		"timestamp":   time.Now().Unix(),
	})
}

// Start begins serving HTTP requests
func (s *Server) Start() error {
	log.Printf("Explorer API listening on %s", s.addr)
	return http.ListenAndServe(s.addr, corsMiddleware(s.mux))
}

// allowedOrigins is the set of origins permitted to call the API via CORS.
// Override with the API_CORS_ORIGINS env var (comma-separated).
var allowedOrigins = func() map[string]bool {
	defaults := []string{
		"https://explorer.netlifegy.com",
		"https://www.netlifegy.com",
		"http://localhost:8080",
		"http://localhost:5173",
	}
	if env := os.Getenv("API_CORS_ORIGINS"); env != "" {
		defaults = strings.Split(env, ",")
	}
	m := make(map[string]bool, len(defaults))
	for _, o := range defaults {
		m[strings.TrimSpace(o)] = true
	}
	return m
}()

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
