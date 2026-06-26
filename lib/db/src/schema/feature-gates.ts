import { pgTable, serial, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const adminWalletsTable = pgTable("admin_wallets", {
  id:            serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull().unique(),
  label:         text("label"),
  isActive:      boolean("is_active").notNull().default(true),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const authNoncesTable = pgTable("auth_nonces", {
  walletAddress: varchar("wallet_address", { length: 42 }).primaryKey(),
  nonce:         text("nonce").notNull(),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const featureGatesTable = pgTable("feature_gates", {
  id:          varchar("id", { length: 100 }).primaryKey(),
  name:        text("name").notNull(),
  description: text("description").notNull().default(""),
  status:      boolean("status").notNull().default(false),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
  updatedBy:   varchar("updated_by", { length: 42 }),
});

export type AdminWallet  = typeof adminWalletsTable.$inferSelect;
export type AuthNonce    = typeof authNoncesTable.$inferSelect;
export type FeatureGate  = typeof featureGatesTable.$inferSelect;
