import fs from "fs";
import app from "./app.js";
import { env } from "./config/env.js";
import { startScheduler } from "./jobs/scheduler.js";
import { logger } from "./utils/logger.js";

fs.mkdirSync(env.uploadDir, { recursive: true });
startScheduler();

app.listen(env.port, () => {
  logger.info(`API server started on port ${env.port}`);
});
