const fs = require("node:fs");
const registerLegacyNodeRoutes = require("./legacy-node-routes.cjs");
const { startNodeHealthMonitor } = require("./node-health-monitor.cjs");

const SETTING_KEY = "auto_update_enabled";
const TIMER_FILE = "/etc/systemd/system/gyds-explorer-auto-update.timer";
const SCHEDULE = "15th of each month at 03:00";
const TIME_ZONE = "America/Guyana";

module.exports = function registerAutoUpdateRoutes({ app, pool, requireAdmin }) {
  const schedulerInstalled = () => fs.existsSync(TIMER_FILE);
  registerLegacyNodeRoutes({ app, pool, requireAdmin });
  startNodeHealthMonitor({
    pool,
    logger: {
      info(fields, message) { console.info(`[Node Monitor] ${message}`, fields); },
      warn(fields, message) { console.warn(`[Node Monitor] ${message}`, fields); },
    },
  });

  const apiRoot = (_req, res) => res.json({
    service: "GYDS Explorer API",
    status: "ok",
    health: "/api/health",
  });
  app.get("/", apiRoot);
  app.get("/api", apiRoot);

  app.get("/api/system/auto-update", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT value, updated_at FROM system_settings WHERE key = $1 LIMIT 1",
        [SETTING_KEY],
      );
      const setting = rows[0];
      res.json({
        enabled: setting?.value === "true",
        schedulerInstalled: schedulerInstalled(),
        schedule: SCHEDULE,
        timeZone: TIME_ZONE,
        updatedAt: setting?.updated_at ? new Date(setting.updated_at).toISOString() : null,
      });
    } catch (err) {
      console.error("[Auto Update] Could not read setting:", err.message);
      res.status(500).json({ error: "Could not read automatic update settings" });
    }
  });

  app.put("/api/system/auto-update", requireAdmin, async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    if (!schedulerInstalled()) {
      res.status(503).json({
        error: "The monthly update timer is not installed on this server. Run the Ubuntu update script first.",
      });
      return;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO system_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by
         RETURNING value, updated_at`,
        [SETTING_KEY, String(req.body.enabled), req.admin?.walletAddress ?? null],
      );
      const setting = rows[0];
      console.info("[Auto Update] Monthly updates", setting.value === "true" ? "enabled" : "disabled");
      res.json({
        enabled: setting.value === "true",
        schedulerInstalled: schedulerInstalled(),
        schedule: SCHEDULE,
        timeZone: TIME_ZONE,
        updatedAt: new Date(setting.updated_at).toISOString(),
      });
    } catch (err) {
      console.error("[Auto Update] Could not save setting:", err.message);
      res.status(500).json({ error: "Could not update automatic update settings" });
    }
  });
};
