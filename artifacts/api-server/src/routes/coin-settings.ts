import { Router } from "express";
import { db } from "@workspace/db";
import { coinSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";

const router = Router();
const SYMBOL_PATTERN = /^[A-Za-z0-9]{1,20}$/;
const DEFAULT_COIN_SETTINGS = [
  { symbol: "GYDS", name: "GYDSChain", decimals: 9, logoUrl: "/assets/gyds-logo.svg", description: "Native coin of the GYDS network." },
  { symbol: "GYD", name: "GYD", decimals: 6, logoUrl: "/assets/gyd-logo.svg", description: "Stablecoin of the GYDS network." },
];

function validUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function settingValues(body: Record<string, unknown>) {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 255) {
    return { error: "name is required and must be at most 255 characters" };
  }
  if (!Number.isInteger(body.decimals) || (body.decimals as number) < 0 || (body.decimals as number) > 36) {
    return { error: "decimals must be an integer between 0 and 36" };
  }
  if (body.logoUrl !== null && body.logoUrl !== undefined && (!validUrl(body.logoUrl) || body.logoUrl.length > 2048)) {
    return { error: "logoUrl must be a valid HTTP(S) URL or null" };
  }
  if (typeof body.description !== "string" || body.description.length > 5000) {
    return { error: "description must be a string of at most 5000 characters" };
  }
  return {
    values: {
      name: body.name.trim(),
      decimals: body.decimals,
      logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim() : null,
      description: body.description.trim(),
    },
  };
}

// GET /coin-settings — list coin settings (public)
router.get("/", async (req, res) => {
  try {
    const settings = await db.select().from(coinSettingsTable).orderBy(coinSettingsTable.symbol);
    res.json(settings.length ? settings : DEFAULT_COIN_SETTINGS);
  } catch (err) {
    req.log.error({ err }, "Fetch coin settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /coin-settings/:symbol — get settings for one coin (public)
router.get("/:symbol", async (req, res) => {
  try {
    const rawSymbol = req.params.symbol;
    const symbol = typeof rawSymbol === "string" ? rawSymbol.toUpperCase() : undefined;
    if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
      res.status(400).json({ error: "Invalid coin symbol" });
      return;
    }
    const [settings] = await db.select().from(coinSettingsTable).where(eq(coinSettingsTable.symbol, symbol));
    const fallback = DEFAULT_COIN_SETTINGS.find((coin) => coin.symbol === symbol);
    if (!settings && !fallback) {
      res.status(404).json({ error: "Coin settings not found" });
      return;
    }
    res.json(settings || fallback);
  } catch (err) {
    req.log.error({ err }, "Fetch coin settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /coin-settings/:symbol — create or update a coin's settings (admin only)
router.put("/:symbol", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const rawSymbol = req.params.symbol;
    const symbol = typeof rawSymbol === "string" ? rawSymbol.toUpperCase() : undefined;
    if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
      res.status(400).json({ error: "Invalid coin symbol" });
      return;
    }
    const result = settingValues(req.body as Record<string, unknown>);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    const values = { symbol, ...result.values, decimals: result.values.decimals as number };
    const [settings] = await db.insert(coinSettingsTable)
      .values(values)
      .onConflictDoUpdate({ target: coinSettingsTable.symbol, set: { ...values, updatedAt: new Date() } })
      .returning();
    req.log.info({ symbol, by: req.admin!.walletAddress }, "Coin settings updated");
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Update coin settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;