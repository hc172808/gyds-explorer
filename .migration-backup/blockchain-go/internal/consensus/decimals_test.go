package consensus

import "testing"

func TestStakeUses18DecimalGYDS(t *testing.T) {
	if MinStake.String() != "1000000000000000000000" {
		t.Fatalf("1000 GYDS stake must use 18 decimals, got %s", MinStake)
	}
}

func TestRewardUses18DecimalGYDS(t *testing.T) {
	if BlockReward.String() != "2000000000000000000" {
		t.Fatalf("2 GYDS reward must use 18 decimals, got %s", BlockReward)
	}
}
