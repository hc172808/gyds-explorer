package mobile

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// WalletConnector provides a mobile SDK for interacting with Guardian Chain
type WalletConnector struct {
	nodeURL string
	client  *http.Client
}

// NewWalletConnector creates a new connector pointing to a Guardian Chain node
func NewWalletConnector(nodeURL string) *WalletConnector {
	return &WalletConnector{
		nodeURL: strings.TrimRight(nodeURL, "/"),
		client:  &http.Client{},
	}
}

// AccountBalance represents dual-coin balances
type AccountBalance struct {
	Address     string `json:"address"`
	GYDSBalance string `json:"gydsBalance"` // 18 decimals
	GYDBalance  string `json:"gydBalance"`  // 6 decimals
	StakeAmount string `json:"stakeAmount"`
	Nonce       uint64 `json:"nonce"`
}

// GetBalance retrieves the balance of a GYDS address
func (wc *WalletConnector) GetBalance(address string) (*AccountBalance, error) {
	resp, err := wc.client.Get(fmt.Sprintf("%s/api/account/%s", wc.nodeURL, address))
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("API error: %s", string(body))
	}

	var bal AccountBalance
	if err := json.Unmarshal(body, &bal); err != nil {
		return nil, err
	}
	return &bal, nil
}

// TransactionRequest represents a transaction to submit
type TransactionRequest struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Value     string `json:"value"`
	CoinType  string `json:"coinType"` // "GYDS" or "GYD"
	GasPrice  uint64 `json:"gasPrice"`
	GasLimit  uint64 `json:"gasLimit"`
	Signature string `json:"signature"`
}

// SubmitTransaction sends a signed transaction to the network
func (wc *WalletConnector) SubmitTransaction(tx TransactionRequest) (string, error) {
	data, err := json.Marshal(tx)
	if err != nil {
		return "", err
	}

	resp, err := wc.client.Post(
		fmt.Sprintf("%s/api/tx/submit", wc.nodeURL),
		"application/json",
		strings.NewReader(string(data)),
	)
	if err != nil {
		return "", fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("submission failed: %s", string(body))
	}

	var result map[string]string
	json.Unmarshal(body, &result)
	return result["txHash"], nil
}

// GetLatestBlock returns the latest block number and hash
func (wc *WalletConnector) GetLatestBlock() (uint64, string, error) {
	resp, err := wc.client.Get(fmt.Sprintf("%s/api/latest", wc.nodeURL))
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	var result struct {
		Number uint64 `json:"number"`
		Hash   string `json:"hash"`
	}

	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	return result.Number, result.Hash, nil
}

// GetTransaction retrieves a transaction by hash
func (wc *WalletConnector) GetTransaction(hash string) (map[string]interface{}, error) {
	resp, err := wc.client.Get(fmt.Sprintf("%s/api/tx/%s", wc.nodeURL, hash))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	return result, nil
}
