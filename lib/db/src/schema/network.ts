import { boolean, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const networkNodeTypeEnum = pgEnum("network_node_type", ["full", "lite", "boot"]);
export const networkNodeStatusEnum = pgEnum("network_node_status", ["connected", "disconnected"]);

export const networkNodesTable = pgTable("network_nodes", {
  id:        serial("id").primaryKey(),
  name:      varchar("name", { length: 255 }).notNull().unique(),
  type:      networkNodeTypeEnum("type").notNull().default("full"),
  rpcUrl:    varchar("rpc_url", { length: 2048 }).notNull(),
  enode:     text("enode"),
  status:    networkNodeStatusEnum("status").notNull().default("disconnected"),
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const coinSettingsTable = pgTable("coin_settings", {
  symbol:      varchar("symbol", { length: 20 }).primaryKey(),
  name:        varchar("name", { length: 255 }).notNull(),
  decimals:    integer("decimals").notNull(),
  logoUrl:     varchar("logo_url", { length: 2048 }),
  description: text("description").notNull().default(""),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export type NetworkNode = typeof networkNodesTable.$inferSelect;
export type NewNetworkNode = typeof networkNodesTable.$inferInsert;
export type CoinSettings = typeof coinSettingsTable.$inferSelect;
export type NewCoinSettings = typeof coinSettingsTable.$inferInsert;