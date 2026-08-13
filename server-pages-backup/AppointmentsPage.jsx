import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import useHotkey from "../../hooks/useHotkey";
import { getColorTagStyle } from "../../lib/colorTags";

export default function AppointmentsPage() {
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pricingPreview, setPricingPreview] = useState(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const titleInputRef = useRef(null);
  const [form, setForm] = useState({
    title: "",
    clientId: "",
    serviceId: "",
    providerId: "",
    startsAt: "",
    endsAt: "",
    location: "",
    notes: "",
    isOvertime: false,
    removeOvertimeCharge: false,
    overtimeReason: "",
    billingNotes: "",
    durationMinutes: 60,
    recurrenceType: "NONE",
    recurrenceCount: 4,
    reminderEnabled: true
  });

  useHotkey({
    key: "n",
    ctrlOrMeta: true,
    onTrigger: () => titleInputRef.current?.focus()
  });

  const load = async () => {
    setIsLoading(true);
    try {
      const [a, c, s, p] = await Promise.all([
        api.get("/appointments"),
        api.get("/clients"),
        api.get("/services", { params: { status: "active" } }),
        api.get("/providers", { params: { status: "active" } })
      ]);
      setAppointments(a.data);
      setEvents(a.data.map((item) => ({
        id: item.id,
        title: `${item.service?.name || item.serviceNameSnapshot || item.title} - ${item.client?.fullName || "Client"}`,
        start: item.startsAt,
        end: item.endsAt,
        backgroundColor: getColorTagStyle(item.service?.colorTag || "gray").eventBg,
        borderColor: getColorTagStyle(item.service?.colorTag || "gray").eventBorder,
        textColor: getColorTagStyle(item.service?.colorTag || "gray").eventText
      })));
      setClients(c.data);
      setServices(s.data);
      setProviders(p.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const durationMinutes = useMemo(() => {
    if (!form.startsAt || !form.endsAt) return Number(form.durationMinutes || 60);
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    const diff = Math.round((end.getTime() - start.getTime()) / 60000);
    return Number.isFinite(diff) && diff > 0 ? diff : Number(form.durationMinutes || 60);
  }, [form.startsAt, form.endsAt, form.durationMinutes]);

  useEffect(() => {
    const canPreview = form.serviceId && form.providerId && durationMinutes > 0;
    if (!canPreview) {
      setPricingPreview(null);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    api.post("/appointments/preview-pricing", {
      serviceId: form.serviceId,
      providerId: form.providerId,
      durationMinutes,
      isOvertime: form.isOvertime,
      removeOvertimeCharge: form.removeOvertimeCharge
    })
      .then((res) => {
        if (!active) return;
        setPricingPreview(res.data);
      })
      .catch((error) => {
        if (!active) return;
        setPricingPreview(null);
        toast?.error(error?.response?.data?.error || "Could not preview pricing.");
      })
      .finally(() => {
        if (!active) return;
        setPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form.serviceId, form.providerId, form.isOvertime, form.removeOvertimeCharge, durationMinutes]);

  useEffect(() => {
    if (!selectedAppointmentId) {
      setSelectedAppointment(null);
      return;
    }
    api.get(`/appointments/${selectedAppointmentId}`)
      .then((res) => setSelectedAppointment(res.data))
      .catch(() => setSelectedAppointment(null));
  }, [selectedAppointmentId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.clientId) {
      toast?.error("Select a client first.");
      return;
    }
    if (!form.startsAt) {
      toast?.error("Select a start date and time.");
      return;
    }
    if (!form.endsAt) {
      toast?.error("Select an end date and time.");
      return;
    }
    if (!form.serviceId) {
      toast?.error("Select a service.");
      return;
    }
    if (!form.providerId) {
      toast?.error("Select a provider.");
      return;
    }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      toast?.error("End time must be after start time.");
      return;
    }
    setIsSaving(true);
    const optimisticId = `temp-event-${Date.now()}`;
    const startsAtDate = new Date(form.startsAt);
    const duration = Number(form.durationMinutes || 60);
    const endsAtDate = new Date(startsAtDate.getTime() + duration * 60 * 1000);
    const selectedClient = clients.find((client) => client.id === form.clientId);
    const selectedService = services.find((service) => service.id === form.serviceId);
    const optimisticStyle = getColorTagStyle(selectedService?.colorTag || "gray");
    const optimisticEvent = {
      id: optimisticId,
      title: `${form.title || "Appointment"} - ${selectedClient?.fullName || "Client"}`,
      start: startsAtDate.toISOString(),
      end: endsAtDate.toISOString(),
      backgroundColor: optimisticStyle.eventBg,
      borderColor: optimisticStyle.eventBorder,
      textColor: optimisticStyle.eventText
    };
    setEvents((prev) => [optimisticEvent, ...prev]);
    try {
      await api.post("/appointments", {
        ...form,
        durationMinutes,
        recurrenceCount: Number(form.recurrenceCount)
      });
      setEvents((prev) => prev.filter((event) => event.id !== optimisticId));
      setForm((prev) => ({
        ...prev,
        title: "",
        startsAt: "",
        endsAt: "",
        location: "",
        notes: "",
        overtimeReason: "",
        billingNotes: "",
        isOvertime: false,
        removeOvertimeCharge: false
      }));
      await load();
      toast?.success("Appointment created.");
    } catch (error) {
      setEvents((prev) => prev.filter((event) => event.id !== optimisticId));
      toast?.error(error?.response?.data?.error || "Could not create appointment.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Appointments</h1>
        <p className="mt-1 text-sm text-slate-500">Schedule sessions and manage recurring visits from one calendar.</p>
      </div>

      <section className="card card-hover">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Create Appointment</h2>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
          <input
            ref={titleInputRef}
            className="saas-input"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <select className="saas-input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Select Client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
          <select className="saas-input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
            <option value="">Select Service</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="saas-input" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
            <option value="">Select Provider</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
          <input className="saas-input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <input className="saas-input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          <input className="saas-input" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <select className="saas-input" value={form.recurrenceType} onChange={(e) => setForm({ ...form, recurrenceType: e.target.value })}>
            <option value="NONE">No recurrence</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
          <input className="saas-input" type="number" value={form.recurrenceCount} onChange={(e) => setForm({ ...form, recurrenceCount: e.target.value })} />
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
            <input type="checkbox" checked={form.isOvertime} onChange={(e) => setForm({ ...form, isOvertime: e.target.checked })} />
            Overtime appointment
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
            <input type="checkbox" checked={form.removeOvertimeCharge} onChange={(e) => setForm({ ...form, removeOvertimeCharge: e.target.checked })} />
            Remove overtime charge
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
            <input type="checkbox" checked={form.reminderEnabled} onChange={(e) => setForm({ ...form, reminderEnabled: e.target.checked })} />
            Reminder enabled
          </label>
          <input className="saas-input md:col-span-2" placeholder="Overtime reason (optional)" value={form.overtimeReason} onChange={(e) => setForm({ ...form, overtimeReason: e.target.value })} />
          <input className="saas-input md:col-span-2" placeholder="Scheduling notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <textarea className="saas-textarea md:col-span-4 min-h-[80px]" placeholder="Billing notes" value={form.billingNotes} onChange={(e) => setForm({ ...form, billingNotes: e.target.value })} />
          <div className="md:col-span-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Pricing Preview</p>
            {previewLoading && <p className="mt-1 text-slate-500">Calculating pricing...</p>}
            {!previewLoading && pricingPreview && (
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <p>Duration: <span className="font-medium">{durationMinutes} min</span></p>
                <p>Standard rate: <span className="font-medium">${pricingPreview.standardRateSnapshot?.toFixed?.(2) ?? pricingPreview.standardRateSnapshot}</span></p>
                <p>Overtime rate: <span className="font-medium">{pricingPreview.overtimeRateSnapshot != null ? `$${pricingPreview.overtimeRateSnapshot.toFixed(2)}` : "-"}</span></p>
                <p>Effective rate: <span className="font-medium">${pricingPreview.effectiveRate?.toFixed?.(2) ?? pricingPreview.effectiveRate}</span></p>
                <p>Pricing source: <span className="font-medium">{pricingPreview.pricingSource}</span></p>
                <p>Estimated charge: <span className="font-medium">${pricingPreview.estimatedCharge?.toFixed?.(2) ?? pricingPreview.estimatedCharge}</span></p>
              </div>
            )}
            {!previewLoading && !pricingPreview && <p className="mt-1 text-slate-500">Select service and provider to preview billing.</p>}
          </div>
          <button className="btn-primary" disabled={isSaving}>{isSaving ? "Creating..." : "Create"}</button>
        </form>
      </section>

      <section className="card card-hover">
        {isLoading ? (
          <div className="space-y-3">
            <div className="skeleton h-9 w-48" />
            <div className="skeleton h-[420px] w-full" />
          </div>
        ) : (
          <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek,dayGridMonth"
          }}
          buttonText={{
            today: "Today",
            timeGridDay: "Day",
            timeGridWeek: "Week",
            dayGridMonth: "Month"
          }}
          dayMaxEventRows={3}
          events={events}
          height="auto"
          eventClick={async (clickInfo) => {
            const shouldDelete = window.confirm("Delete this appointment?");
            if (!shouldDelete) return;
            const id = clickInfo.event.id;
            const previous = events;
            setEvents((prev) => prev.filter((event) => event.id !== id));
            try {
              await api.delete(`/appointments/${id}`);
              toast?.success("Appointment deleted.");
            } catch {
              setEvents(previous);
              toast?.error("Could not delete appointment.");
            }
          }}
          />
        )}
      </section>

      <section className="card card-hover">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Appointments</h2>
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Date/Time</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Overtime</th>
                <th className="px-4 py-3 font-medium">Rate</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((item) => (
                <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 text-slate-700">{item.client?.fullName || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${getColorTagStyle(item.service?.colorTag || "gray").dot}`} />
                      {item.service?.name || item.serviceNameSnapshot || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{item.provider?.fullName || item.providerNameSnapshot || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(item.startsAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600">{item.durationMinutes} min</td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.isOvertime ? "Yes" : "No"}{item.removeOvertimeCharge ? " (charge removed)" : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.effectiveRate != null ? `$${Number(item.effectiveRate).toFixed(2)}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.status}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setSelectedAppointmentId(item.id)}>View</button>
                  </td>
                </tr>
              ))}
              {!appointments.length && (
                <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={9}>No appointments scheduled yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-hover">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Appointment Detail</h2>
        {!selectedAppointment && <p className="text-sm text-slate-500">Select an appointment from the list to view details.</p>}
        {selectedAppointment && (
          <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <p><span className="font-medium text-slate-900">Client:</span> {selectedAppointment.client?.fullName || "-"}</p>
            <p><span className="font-medium text-slate-900">Provider:</span> {selectedAppointment.provider?.fullName || selectedAppointment.providerNameSnapshot || "-"}</p>
            <p>
              <span className="font-medium text-slate-900">Service:</span>{" "}
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getColorTagStyle(selectedAppointment.service?.colorTag || "gray").badge}`}>
                {selectedAppointment.service?.name || selectedAppointment.serviceNameSnapshot || "-"}
              </span>
            </p>
            <p><span className="font-medium text-slate-900">Scheduled:</span> {new Date(selectedAppointment.startsAt).toLocaleString()} - {new Date(selectedAppointment.endsAt).toLocaleString()}</p>
            <p><span className="font-medium text-slate-900">Overtime:</span> {selectedAppointment.isOvertime ? "Yes" : "No"}</p>
            <p><span className="font-medium text-slate-900">Overtime charge removed:</span> {selectedAppointment.removeOvertimeCharge ? "Yes" : "No"}</p>
            <p><span className="font-medium text-slate-900">Standard rate snapshot:</span> {selectedAppointment.standardRateSnapshot != null ? `$${Number(selectedAppointment.standardRateSnapshot).toFixed(2)}` : "-"}</p>
            <p><span className="font-medium text-slate-900">Overtime rate snapshot:</span> {selectedAppointment.overtimeRateSnapshot != null ? `$${Number(selectedAppointment.overtimeRateSnapshot).toFixed(2)}` : "-"}</p>
            <p><span className="font-medium text-slate-900">Effective rate:</span> {selectedAppointment.effectiveRate != null ? `$${Number(selectedAppointment.effectiveRate).toFixed(2)}` : "-"}</p>
            <p><span className="font-medium text-slate-900">Pricing source:</span> {selectedAppointment.pricingSource || "-"}</p>
            <p className="md:col-span-2"><span className="font-medium text-slate-900">Billing notes:</span> {selectedAppointment.billingNotes || "-"}</p>
          </div>
        )}
      </section>
    </div>
  );
}
