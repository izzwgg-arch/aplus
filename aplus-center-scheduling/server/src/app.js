import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import clientRoutes from "./routes/client.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import reportRoutes from "./routes/report.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import waitlistRoutes from "./routes/waitlist.routes.js";
import intakeRoutes from "./routes/intake.routes.js";
import userRoutes from "./routes/user.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import integrationRoutes from "./routes/integration.routes.js";
import dataTrackingRoutes from "./routes/dataTracking.routes.js";
import assessmentRoutes from "./routes/assessment.routes.js";
import assessmentTemplateRoutes from "./routes/assessmentTemplate.routes.js";
import assessmentReportRoutes from "./routes/assessmentReport.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import providerRoutes from "./routes/provider.routes.js";
import clientFilesRoutes from "./routes/clientFiles.routes.js";
import webhooksRoutes from "./routes/webhooks.routes.js";
import reminderRoutes from "./routes/reminder.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const app = express();
app.set("trust proxy", 1);

app.use(
  helmet({
    // Keep strict headers, but avoid forcing HTTPS until TLS is configured.
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.cardknox.com"],
        "frame-src": ["'self'", "https://cdn.cardknox.com"],
        "child-src": ["'self'", "https://cdn.cardknox.com"],
        "connect-src": ["'self'", "https://cdn.cardknox.com"],
        "upgrade-insecure-requests": null
      }
    }
  })
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve uploaded files from the same directory multer writes to (resolved from CWD/env).
// Using env.uploadDir keeps storage + serving consistent — no path mismatch.
app.use("/uploads", express.static(path.resolve(env.uploadDir)));
const clientDist = path.resolve(__dirname, "../../client/dist");

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ ok: true, db: "up" });
  } catch {
    return res.status(503).json({ ok: false, db: "down" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/waitlist", waitlistRoutes);
app.use("/api/intake", intakeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/data-tracking", dataTrackingRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/assessment-templates", assessmentTemplateRoutes);
app.use("/api/assessment-reports", assessmentReportRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/clients/:clientId/files", clientFilesRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/admin", adminRoutes);

if (process.env.NODE_ENV === "production") {
  // Hashed assets (JS/CSS chunks) can be cached forever — their filenames change on every build.
  // index.html must NEVER be cached — it's the entry point that references the current chunk names.
  app.use("/assets", express.static(path.join(clientDist, "assets"), { maxAge: "1y", immutable: true }));
  app.use(express.static(clientDist, { maxAge: 0, etag: false }));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use(errorHandler);

export default app;
