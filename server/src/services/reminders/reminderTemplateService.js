import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma.js";

const DEFAULTS = {
  CLIENT_EMAIL: {
    subject: "Appointment Reminder — {{appointment_date}} at {{appointment_time}}",
    bodyTemplate: `<p>Hello {{client_first_name}},</p>
<p>This is a reminder for your appointment on <strong>{{appointment_date}}</strong> at <strong>{{appointment_time}}</strong> with {{provider_name}}.</p>
<p>Location: {{location}}</p>
<p>If you need to reschedule, please contact us at {{contact_phone}}.</p>`
  },
  CLIENT_SMS: {
    subject: null,
    bodyTemplate:
      "Reminder: You have an appointment with {{practice_name}} on {{appointment_date}} at {{appointment_time}}. Reply STOP to opt out."
  },
  PROVIDER_EMAIL: {
    subject: "Upcoming appointment with {{client_name}}",
    bodyTemplate:
      "<p>You have an upcoming appointment with {{client_name}} on {{appointment_date}} at {{appointment_time}}.</p><p>Location: {{location}}</p><p>Service: {{service_name}}</p>"
  },
  PROVIDER_SMS: {
    subject: null,
    bodyTemplate:
      "A+ reminder: {{client_name}} on {{appointment_date}} at {{appointment_time}}. {{location}}"
  }
};

export async function ensureDefaultReminderTemplates() {
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const existing = await prisma.reminderTemplate.findUnique({ where: { templateKey: key } });
    if (existing) continue;
    await prisma.reminderTemplate.create({
      data: {
        id: randomUUID(),
        templateKey: key,
        subject: def.subject,
        bodyTemplate: def.bodyTemplate
      }
    });
  }
}

export async function listReminderTemplates() {
  await ensureDefaultReminderTemplates();
  return prisma.reminderTemplate.findMany({ orderBy: { templateKey: "asc" } });
}

export async function updateReminderTemplate(templateKey, { subject, bodyTemplate }) {
  await ensureDefaultReminderTemplates();
  return prisma.reminderTemplate.update({
    where: { templateKey },
    data: {
      ...(subject !== undefined ? { subject } : {}),
      ...(bodyTemplate !== undefined ? { bodyTemplate } : {})
    }
  });
}

export async function getReminderTemplate(templateKey) {
  await ensureDefaultReminderTemplates();
  return prisma.reminderTemplate.findUnique({ where: { templateKey } });
}
