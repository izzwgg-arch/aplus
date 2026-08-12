import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { upload } from "../middleware/upload.js";
import { createInvoiceFromAppointment } from "../services/invoiceService.js";

const router = express.Router();

router.get("/upload/:token", async (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, env.jwtSecret);
    if (payload.type !== "report-upload") return res.status(400).send("Invalid upload token");
    return res.type("html").send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>A+ Center Report Upload</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; background: #f8fafc; }
          .wrap { max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; }
          h1 { margin-top: 0; color: #0f4d8c; }
          .btn { background: #1667b8; color: #fff; border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>Upload Visit Report</h1>
          <p>Please upload PDF or JPEG for the completed visit.</p>
          <form method="post" action="/api/reports/upload/${encodeURIComponent(req.params.token)}" enctype="multipart/form-data">
            <input type="file" name="file" accept=".pdf,.jpeg,.jpg,.png" required />
            <br /><br />
            <button class="btn" type="submit">Upload report</button>
          </form>
        </div>
      </body>
      </html>
    `);
  } catch {
    return res.status(400).send("Token invalid or expired");
  }
});

router.post("/upload/:token", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing report file" });
  try {
    const payload = jwt.verify(req.params.token, env.jwtSecret);
    if (payload.type !== "report-upload") return res.status(400).json({ error: "Invalid upload token" });
    const report = await prisma.report.upsert({
      where: { appointmentId: payload.appointmentId },
      update: {
        fileName: req.file.originalname,
        filePath: req.file.path,
        mimeType: req.file.mimetype
      },
      create: {
        appointmentId: payload.appointmentId,
        fileName: req.file.originalname,
        filePath: req.file.path,
        mimeType: req.file.mimetype
      }
    });
    await createInvoiceFromAppointment(payload.appointmentId);
    return res.json({ message: "Report uploaded", reportId: report.id });
  } catch {
    return res.status(400).json({ error: "Token invalid or expired" });
  }
});

router.get("/", requireAuth, requirePermission("aplus.reports.view"), async (_req, res) => {
  const reports = await prisma.report.findMany({ include: { appointment: true } });
  return res.json(reports);
});

export default router;
