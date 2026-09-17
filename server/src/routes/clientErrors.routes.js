import express from "express";
import { requireAuth } from "../middleware/auth.js";

/**
 * POST /api/client-errors — the browser reports an uncaught error here.
 *
 * A React render error unmounts the whole page (the user sees it "go blank")
 * and, until this existed, left no trace anywhere on the server. The client's
 * ErrorBoundary and window error handlers post here; the report is written to
 * the app log so it can be read back with `pm2 logs aba-app`.
 *
 * Nothing is stored in the database — it is a log line, size-capped, from an
 * authenticated user only, and never echoed back.
 */
const router = express.Router();
router.use(requireAuth);

const cap = (v, n) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, n);

router.post("/", (req, res) => {
  const b = req.body || {};
  const who = req.user?.email || req.user?.sub || "unknown";
  const lines = [
    `[client-error] user=${who} source=${cap(b.source, 40) || "unknown"} at=${cap(b.at, 40)}`,
    `  url: ${cap(b.url, 500)}`,
    `  message: ${cap(b.message, 1000)}`,
  ];
  const stack = cap(b.stack, 4000).split("\n").slice(0, 12).join("\n    ");
  if (stack) lines.push(`  stack:\n    ${stack}`);
  const comp = cap(b.componentStack, 2000).split("\n").filter(Boolean).slice(0, 8).join("\n    ");
  if (comp) lines.push(`  components:\n    ${comp}`);
  const ua = cap(b.userAgent, 300);
  if (ua) lines.push(`  ua: ${ua}`);
  console.error(lines.join("\n"));
  return res.status(204).send();
});

export default router;
