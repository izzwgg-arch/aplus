/**
 * Client-side mirror of server reminder merge + sample data for previews only.
 * Tokens must stay {{ snake_case }} to match reminderMerge.js on the server.
 */

/**
 * Must match server `DEFAULTS` in reminderTemplateService.js (restore suggested wording).
 */
export const REMINDER_TEMPLATE_DEFAULTS = {
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
    bodyTemplate: "A+ reminder: {{client_name}} on {{appointment_date}} at {{appointment_time}}. {{location}}"
  }
};

export const SAMPLE_PREVIEW_CONTEXT = {
  client_first_name: "Sarah",
  client_name: "Sarah Cohen",
  provider_name: "Dr. Rachel Weiss",
  appointment_date: "Thursday, March 20, 2025",
  appointment_time: "3:00 PM",
  appointment_end_time: "4:00 PM",
  location: "123 Main Street, Suite 200",
  service_name: "ABA Therapy Session",
  practice_name: "A+ Center",
  contact_phone: "(555) 123-4567",
  appointment_notes: "Please bring insurance card."
};

/** @type {{ id: string; label: string; hint?: string }[]} */
export const REMINDER_TEMPLATE_VARIABLES = [
  { id: "client_first_name", label: "First name", hint: "Client’s first name" },
  { id: "client_name", label: "Full name", hint: "Client’s full name" },
  { id: "provider_name", label: "Provider", hint: "Assigned or default provider" },
  { id: "appointment_date", label: "Date", hint: "e.g. Thursday, March 20, 2025" },
  { id: "appointment_time", label: "Start time", hint: "Appointment start" },
  { id: "appointment_end_time", label: "End time", hint: "Appointment end" },
  { id: "location", label: "Location", hint: "Address or link" },
  { id: "service_name", label: "Service", hint: "Type of visit" },
  { id: "practice_name", label: "Practice name", hint: "Your clinic name" },
  { id: "contact_phone", label: "Phone", hint: "Office phone for replies" },
  { id: "appointment_notes", label: "Notes", hint: "Notes on the appointment" }
];

export function mergeTemplatePreview(template, ctx = SAMPLE_PREVIEW_CONTEXT) {
  if (!template) return "";
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key).trim();
    return ctx[k] != null ? String(ctx[k]) : "";
  });
}

function offsetJsonToMinutes(entry) {
  if (!entry || typeof entry !== "object") return null;
  const v = Number(entry.value);
  if (!Number.isFinite(v) || v < 0) return null;
  const u = String(entry.unit || "MINUTES").toUpperCase();
  if (u === "DAYS") return Math.round(v * 24 * 60);
  if (u === "HOURS") return Math.round(v * 60);
  if (u === "MINUTES") return Math.round(v);
  return null;
}

export function describeOffsetsHuman(jsonStr) {
  if (!jsonStr || !String(jsonStr).trim()) return "No reminders scheduled ahead of time.";
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return "Invalid schedule format.";
    const parts = arr
      .map((e) => {
        const m = offsetJsonToMinutes(e);
        if (m == null || m <= 0) return null;
        if (m % 1440 === 0) {
          const d = m / 1440;
          return d === 1 ? "1 day before" : `${d} days before`;
        }
        if (m % 60 === 0) {
          const h = m / 60;
          return h === 1 ? "1 hour before" : `${h} hours before`;
        }
        return m === 1 ? "1 minute before" : `${m} minutes before`;
      })
      .filter(Boolean);
    return parts.length ? `Send: ${parts.join(" · ")}` : "No valid reminder times in the list.";
  } catch {
    return "Could not read reminder schedule.";
  }
}

export function minutesToTimeLabel(totalMinutes) {
  const m = Number(totalMinutes);
  if (!Number.isFinite(m)) return "—";
  const h24 = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

export function stripHtmlForPreview(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const TEMPLATE_SECTION_META = {
  CLIENT_EMAIL: {
    title: "Client email",
    subtitle: "Sent to the client’s email before the visit.",
    kind: "email"
  },
  CLIENT_SMS: {
    title: "Client text (SMS)",
    subtitle: "Short text to the client’s mobile. Keep it concise.",
    kind: "sms"
  },
  PROVIDER_EMAIL: {
    title: "Provider email",
    subtitle: "Sent to the assigned provider (or your default coordinator if no provider).",
    kind: "email"
  },
  PROVIDER_SMS: {
    title: "Provider text (SMS)",
    subtitle: "Short text reminder for staff.",
    kind: "sms"
  }
};

export const TEMPLATE_TAB_ORDER = ["CLIENT_EMAIL", "CLIENT_SMS", "PROVIDER_EMAIL", "PROVIDER_SMS"];
