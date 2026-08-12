import express from "express";
import PDFDocument from "pdfkit";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
router.use(requireAuth);

router.get("/pdf", requirePermission("aplus.intake.view"), async (_req, res) => {
  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=intake-form.pdf");
  doc.pipe(res);
  doc.fontSize(18).text("A+ Center Intake Form");
  doc.moveDown();
  doc.fontSize(12).text("Client Name: _____________________________");
  doc.text("DOB: ______________________");
  doc.text("Phone: ____________________");
  doc.text("Email: _____________________");
  doc.moveDown();
  doc.text("Medical Notes:");
  doc.text("________________________________________________________");
  doc.text("________________________________________________________");
  doc.end();
});

export default router;
