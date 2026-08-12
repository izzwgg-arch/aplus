function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatAppointmentContext({
  appointment,
  client,
  provider,
  service,
  clinic
}) {
  const starts = appointment?.startsAt ? new Date(appointment.startsAt) : null;
  const ends = appointment?.endsAt ? new Date(appointment.endsAt) : null;
  const tz = clinic?.timezone || "America/New_York";

  const dateStr = starts
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(starts)
    : "—";
  const timeStr = starts
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(starts)
    : "—";
  const endTimeStr = ends
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(ends)
    : "—";

  const clientFirst = (client?.firstName || client?.fullName || "there").trim();
  const clientName = client?.fullName || `${client?.firstName || ""} ${client?.lastName || ""}`.trim() || "Client";
  const providerName =
    provider?.fullName || appointment?.providerNameSnapshot || "your provider";
  const serviceName = service?.name || appointment?.serviceNameSnapshot || appointment?.title || "Appointment";
  const location = appointment?.location || clinic?.companyAddress || "TBD";
  const practiceName = clinic?.companyName || "A+ Center";
  const contactPhone = clinic?.companyPhone || "";

  return {
    client_first_name: clientFirst,
    client_name: clientName,
    provider_name: providerName,
    appointment_date: dateStr,
    appointment_time: timeStr,
    appointment_end_time: endTimeStr,
    location,
    service_name: serviceName,
    practice_name: practiceName,
    contact_phone: contactPhone,
    appointment_notes: appointment?.notes || ""
  };
}

export function mergeTemplate(template, ctx) {
  if (!template) return "";
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const k = String(key).trim();
    return ctx[k] != null ? String(ctx[k]) : "";
  });
}
