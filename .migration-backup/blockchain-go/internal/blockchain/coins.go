package blockchain

import "math/big"

// Consensus denomination constants. Balances, transaction values and snapshots
// store integer base units, never floating-point coin amounts.
const (
	GYDSDecimals = 18
	GYDDecimals  = 6
)

// GYDSBaseUnits returns the number of base units in one GYDS.
// Return a fresh integer so callers cannot mutate the denomination globally.
func GYDSBaseUnits() *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(GYDSDecimals), nil)
}

// GYDBaseUnits returns the number of base units in one GYD.
func GYDBaseUnits() *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(GYDDecimals), nil)
}
