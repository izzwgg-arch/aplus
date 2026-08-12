import cron from "node-cron";
import { runReminderSweep } from "../services/reminderService.js";
import { logger } from "../utils/logger.js";

/**
 * Scheduled jobs — no QuickBooks polling here. QB sync is request-driven (payments,
 * invoice create, manual sync routes) to avoid redundant API usage.
 */
export function startScheduler() {
  cron.schedule("* * * * *", async () => {
    try {
      await runReminderSweep();
    } catch (error) {
      logger.error("Reminder job failed", { error: error.message });
    }
  });
}
