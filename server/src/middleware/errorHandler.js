import { logger } from "../utils/logger.js";

export function errorHandler(err, req, res, next) { // eslint-disable-line
  logger.error("Request failed", { path: req.path, method: req.method, error: err.message });
  return res.status(500).json({ error: "Server error" });
}
