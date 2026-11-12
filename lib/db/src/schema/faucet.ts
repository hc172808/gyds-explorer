import { primaryKey, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const faucetClaimsTable = pgTable("faucet_claims", {
  network:        varchar("network", { length: 20 }).notNull().default("testnet"),
  walletAddress:  varchar("wallet_address", { length: 42 }).notNull(),
  lastClaimAt:    timestamp("last_claim_at", { withTimezone: true }),
  reservationId:  varchar("reservation_id", { length: 36 }),
  reservedAt:     timestamp("reserved_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.network, table.walletAddress] }),
}));

export type FaucetClaim = typeof faucetClaimsTable.$inferSelect;
