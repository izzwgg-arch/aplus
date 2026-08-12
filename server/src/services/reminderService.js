import jwt from "jsonwebtoken";
import { isBefore, subHours } from "date-fns";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { sendEmail } from "../utils/mailer.js";
import { createInvoiceFromAppointment } from "./invoiceService.js";
import { processDueReminderJobs } from "./reminders/reminderJobProcessor.js";

export async function runReminderSweep() {
  try {
    await processDueReminderJobs(40);
  } catch (e) {
    console.error("[reminderSweep] processDueReminderJobs", e?.message);
  }

  const now = new Date();
  const completed = await prisma.appointment.findMany({
    where: {
      status: "COMPLETED",
      postReportRequestedAt: null,
      endsAt: { lte: subHours(now, 1) }
    },
    include: { bcba: true }
  });

  for (const appt of completed) {
    const uploadToken = jwt.sign(
      { appointmentId: appt.id, type: "report-upload" },
      env.jwtSecret,
      { expiresIn: "2d" }
    );
    const link = `${env.apiBaseUrl || "http://localhost:4000"}/api/reports/upload/${uploadToken}`;
    await sendEmail({
      to: appt.bcba.email,
      subject: "Please scan & upload the visit report",
      html: `<p>Please upload the visit report: <a href="${link}">Secure Upload Link</a></p>`
    });
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { postReportRequestedAt: now }
    });
  }

  const newlyUploadedReports = await prisma.report.findMany({
    where: { uploadedAt: { gte: subHours(now, 1), lte: now } },
    include: { appointment: true }
  });
  for (const report of newlyUploadedReports) {
    if (isBefore(report.uploadedAt, subHours(now, 1))) continue;
    await createInvoiceFromAppointment(report.appointmentId);
  }
}
