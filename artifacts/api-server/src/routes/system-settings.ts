import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import {
  GetAutoUpdateSettingsResponse,
  UpdateAutoUpdateSettingsBody,
  UpdateAutoUpdateSettingsResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";

const router = Router();
const AUTO_UPDATE_KEY = "auto_update_enabled";
const AUTO_UPDATE_SCHEDULE = "15th of each month at 03:00";
const AUTO_UPDATE_TIME_ZONE = "America/Guyana";

function makeResponse(enabled: boolean, updatedAt: Date | null) {
  return {
    enabled,
    schedulerInstalled: process.env.AUTO_UPDATE_SCHEDULER_AVAILABLE === "true",
    schedule: AUTO_UPDATE_SCHEDULE,
    timeZone: AUTO_UPDATE_TIME_ZONE,
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}

router.get("/auto-update", requireAdmin, async (req, res): Promise<void> => {
  try {
    const [setting] = await db
      .select({ value: systemSettingsTable.value, updatedAt: systemSettingsTable.updatedAt })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, AUTO_UPDATE_KEY))
      .limit(1);

    res.json(GetAutoUpdateSettingsResponse.parse(
      makeResponse(setting?.value === "true", setting?.updatedAt ?? null),
    ));
  } catch (err) {
    req.log.error({ err }, "Read automatic update settings error");
    res.status(500).json({ error: "Could not read automatic update settings" });
  }
});

router.put("/auto-update", requireAdmin, async (req: AdminRequest, res): Promise<void> => {
  const input = UpdateAutoUpdateSettingsBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  if (process.env.AUTO_UPDATE_SCHEDULER_AVAILABLE !== "true") {
    res.status(503).json({
      error: "The monthly update timer is not installed on this server. Run the Ubuntu update script first.",
    });
    return;
  }

  try {
    const now = new Date();
    const [setting] = await db
      .insert(systemSettingsTable)
      .values({
        key: AUTO_UPDATE_KEY,
        value: String(input.data.enabled),
        updatedAt: now,
        updatedBy: req.admin?.walletAddress ?? null,
      })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: {
          value: String(input.data.enabled),
          updatedAt: now,
          updatedBy: req.admin?.walletAddress ?? null,
        },
      })
      .returning({ value: systemSettingsTable.value, updatedAt: systemSettingsTable.updatedAt });

    req.log.info({ enabled: setting.value === "true" }, "Automatic monthly updates changed");
    res.json(UpdateAutoUpdateSettingsResponse.parse(
      makeResponse(setting.value === "true", setting.updatedAt),
    ));
  } catch (err) {
    req.log.error({ err }, "Update automatic update settings error");
    res.status(500).json({ error: "Could not update automatic update settings" });
  }
});

export default router;
