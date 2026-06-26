package explorer

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (s *Server) writeError(w http.ResponseWriter, status int, msg string) {
	s.writeJSON(w, status, map[string]string{"error": msg})
}

// GET /api/block/{hash}
func (s *Server) handleGetBlock(w http.ResponseWriter, r *http.Request) {
	hash := strings.TrimPrefix(r.URL.Path, "/api/block/")
	if hash == "" {
		s.writeError(w, 400, "block hash required")
		return
	}

	block, err := s.chain.GetBlock(hash)
	if err != nil {
		s.writeError(w, 404, fmt.Sprintf("block not found: %s", hash))
		return
	}

	s.writeJSON(w, 200, block)
}

// GET /api/block-by-number/{number}
func (s *Server) handleGetBlockByNumber(w http.ResponseWriter, r *http.Request) {
	numStr := strings.TrimPrefix(r.URL.Path, "/api/block-by-number/")
	num, err := strconv.ParseUint(numStr, 10, 64)
	if err != nil {
		s.writeError(w, 400, "invalid block number")
		return
	}

	block, err := s.chain.GetBlockByNumber(num)
	if err != nil {
		s.writeError(w, 404, fmt.Sprintf("block %d not found", num))
		return
	}

	s.writeJSON(w, 200, block)
}

// GET /api/tx/{hash}
func (s *Server) handleGetTransaction(w http.ResponseWriter, r *http.Request) {
	hash := strings.TrimPrefix(r.URL.Path, "/api/tx/")
	if hash == "" {
		s.writeError(w, 400, "transaction hash required")
		return
	}

	tx, err := s.indexer.GetTransaction(hash)
	if err != nil {
		s.writeError(w, 404, fmt.Sprintf("transaction not found: %s", hash))
		return
	}

	s.writeJSON(w, 200, tx)
}

// GET /api/account/{address}
func (s *Server) handleGetAccount(w http.ResponseWriter, r *http.Request) {
	addr := strings.TrimPrefix(r.URL.Path, "/api/account/")
	if addr == "" {
		s.writeError(w, 400, "address required")
		return
	}

	// Get live state
	account := s.chain.State().GetAccount(addr)

	// Get indexed data for tx count
	indexed, _ := s.indexer.GetAccount(addr)

	response := map[string]interface{}{
		"address":     addr,
		"gydsBalance": account.GYDSBalance.String(),
		"gydBalance":  account.GYDBalance.String(),
		"stakeAmount": account.StakeAmount.String(),
		"nonce":       account.Nonce,
	}

	if indexed != nil {
		response["txCount"] = indexed.TxCount
		response["lastActiveAt"] = indexed.LastActiveAt
	}

	s.writeJSON(w, 200, response)
}

// GET /api/latest
func (s *Server) handleLatest(w http.ResponseWriter, r *http.Request) {
	num, hash := s.chain.LatestBlock()
	s.writeJSON(w, 200, map[string]interface{}{
		"number": num,
		"hash":   hash,
	})
}

// GET /api/pending
func (s *Server) handlePendingTxs(w http.ResponseWriter, r *http.Request) {
	txs := s.chain.PendingTxs()
	s.writeJSON(w, 200, map[string]interface{}{
		"count":        len(txs),
		"transactions": txs,
	})
}

// GET /api/status
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	num, hash := s.chain.LatestBlock()
	indexed := s.indexer.GetLastIndexedBlock()
	s.writeJSON(w, 200, map[string]interface{}{
		"chainHeight":       num,
		"latestHash":        hash,
		"indexedHeight":     indexed,
		"pendingTxCount":    len(s.chain.PendingTxs()),
	})
}
