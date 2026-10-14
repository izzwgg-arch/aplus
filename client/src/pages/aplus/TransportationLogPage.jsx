import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v || 0));
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLORS = {
  PENDING: { bg: "#FFFBEB", color: "#B45309" },
  AUTHORIZED: { bg: "#EFF6FF", color: "#2563EB" },
  SUCCEEDED: { bg: "#DCFCE7", color: "#15803D" },
  FAILED: { bg: "#FEF2F2", color: "#DC2626" }
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 9999 }}>
      {status}
    </span>
  );
}

/**
 * Add/Edit Transportation Modal
 */
function TransportationModal({ entry, clients, onClose, onSave }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [form, setForm] = useState(
    entry || {
      clientId: "",
      clientName: "",
      serviceDate: new Date().toISOString().split("T")[0],
      description: "",
      amount: "",
      paymentStatus: "PENDING",
      paidBy: "Client",
      notes: ""
    }
  );

  const filteredClients = clients.filter(c =>
    c.fullName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.firstName?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.lastName?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handleSelectClient = (client) => {
    setForm({ ...form, clientId: client.id, clientName: client.fullName });
    setClientSearch("");
    setShowClientDropdown(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.clientId) return toast?.error("Select a client.");
    if (!form.serviceDate) return toast?.error("Enter service date.");
    if (!form.amount || Number(form.amount) <= 0) return toast?.error("Enter a valid amount.");

    setSaving(true);
    try {
      const payload = {
        clientId: form.clientId,
        serviceDate: form.serviceDate,
        description: form.description || undefined,
        amount: Number(form.amount),
        paymentStatus: form.paymentStatus,
        paidBy: form.paidBy || undefined,
        notes: form.notes || undefined
      };

      if (entry) {
        await api.patch(`/transportation/${entry.id}`, payload);
        toast?.success("Transportation log updated.");
      } else {
        await api.post("/transportation", payload);
        toast?.success("Transportation log created.");
      }
      onSave();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "white", borderRadius: 12, padding: 24, maxWidth: 500, width: "90%" }}>
        <h2 style={{ margin: 0, marginBottom: 16, fontSize: 18 }}>{entry ? "Edit Transportation" : "Add Transportation"}</h2>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12, position: "relative" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Client *</label>
            <input
              type="text"
              value={clientSearch || form.clientName}
              onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
              onFocus={() => setShowClientDropdown(true)}
              placeholder="Search client..."
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
            {showClientDropdown && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 6px 6px", maxHeight: 200, overflowY: "auto", zIndex: 100 }}>
                {filteredClients.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 13, color: "#999" }}>No clients found</div>
                ) : (
                  filteredClients.map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", fontSize: 13 }}
                      onMouseEnter={(e) => e.target.style.background = "#f9fafb"}
                      onMouseLeave={(e) => e.target.style.background = "white"}
                    >
                      {c.fullName}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Service Date *</label>
            <input
              type="date"
              value={form.serviceDate}
              onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g., Round trip transportation"
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Payment Status</label>
            <select
              value={form.paymentStatus}
              onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
            >
              <option value="PENDING">Pending</option>
              <option value="AUTHORIZED">Authorized</option>
              <option value="SUCCEEDED">Succeeded</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Paid By</label>
            <input
              type="text"
              value={form.paidBy}
              onChange={(e) => setForm({ ...form, paidBy: e.target.value })}
              placeholder="e.g., Client, Insurance, Clinic"
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes..."
              rows="3"
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 1, padding: 10, background: "#2563EB", color: "white", border: "none", borderRadius: 6, fontWeight: 500, cursor: "pointer" }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: 10, background: "#f0f0f0", border: "none", borderRadius: 6, fontWeight: 500, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Main Transportation Log Page
 */
export default function TransportationLogPage() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [view, setView] = useState("all"); // "all" or "weekly"
  const [weeklySummary, setWeeklySummary] = useState(null);

  const [filters, setFilters] = useState({
    clientId: "",
    paymentStatus: "",
    from: "",
    to: ""
  });

  // Fetch clients
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/clients?limit=1000`);
        setClients(res.data.clients || []);
      } catch (err) {
        console.error("Failed to load clients:", err?.message);
      }
    };
    load();
  }, []);

  // Fetch transportation logs
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.clientId) params.append("clientId", filters.clientId);
        if (filters.paymentStatus) params.append("paymentStatus", filters.paymentStatus);
        if (filters.from) params.append("from", filters.from);
        if (filters.to) params.append("to", filters.to);

        const res = await api.get(`/transportation?${params.toString()}`);
        setLogs(res.data.logs || []);
      } catch (err) {
        toast?.error("Failed to load transportation logs.");
        console.error(err?.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters]);

  // Fetch weekly summary
  useEffect(() => {
    if (view === "weekly") {
      const load = async () => {
        try {
          const res = await api.get("/transportation/weekly-summary");
          setWeeklySummary(res.data);
        } catch (err) {
          toast?.error("Failed to load weekly summary.");
          console.error(err?.message);
        }
      };
      load();
    }
  }, [view]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this transportation log?")) return;
    try {
      await api.delete(`/transportation/${id}`);
      toast?.success("Transportation log deleted.");
      setLogs(logs.filter(l => l.id !== id));
    } catch (err) {
      toast?.error("Failed to delete.");
    }
  };

  const handleSave = () => {
    setModalOpen(false);
    setEditEntry(null);
    setFilters({ ...filters });
  };

  const totalAmount = useMemo(() => logs.reduce((sum, l) => sum + (l.amount || 0), 0), [logs]);

  if (view === "weekly" && weeklySummary) {
    return (
      <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Weekly Transportation Summary</h1>
          <button
            onClick={() => setView("all")}
            style={{ padding: "8px 16px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}
          >
            View All
          </button>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            Week of {fmtDate(new Date(weeklySummary.weekStart))} to {fmtDate(new Date(weeklySummary.weekEnd))}
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 24 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Total Entries</p>
              <p style={{ margin: "4px 0 0 0", fontSize: 20, fontWeight: "bold" }}>{weeklySummary.totalEntries}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Total Amount</p>
              <p style={{ margin: "4px 0 0 0", fontSize: 20, fontWeight: "bold" }}>{money(weeklySummary.totalAmount)}</p>
            </div>
          </div>
        </div>

        {weeklySummary.summary.map(clientSummary => (
          <div key={clientSummary.clientId} style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>{clientSummary.clientName}</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd" }}>
                  <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600 }}>Description</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 600 }}>Amount</th>
                  <th style={{ textAlign: "center", padding: "8px 0", fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {clientSummary.entries.map(log => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px 0" }}>{fmtDate(log.serviceDate)}</td>
                    <td style={{ padding: "8px 0" }}>{log.description || "—"}</td>
                    <td style={{ textAlign: "right", padding: "8px 0" }}>{money(log.amount)}</td>
                    <td style={{ textAlign: "center", padding: "8px 0" }}>
                      <StatusPill status={log.paymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: "flex", gap: 24, fontSize: 13 }}>
              <div>
                <span style={{ color: "#666" }}>Pending: </span>
                <span style={{ fontWeight: 600 }}>{clientSummary.byPaymentStatus.PENDING.count} ({money(clientSummary.byPaymentStatus.PENDING.amount)})</span>
              </div>
              <div>
                <span style={{ color: "#666" }}>Paid: </span>
                <span style={{ fontWeight: 600 }}>{clientSummary.byPaymentStatus.SUCCEEDED.count} ({money(clientSummary.byPaymentStatus.SUCCEEDED.amount)})</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Transportation Log</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setView("weekly")}
            style={{ padding: "8px 16px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer" }}
          >
            Weekly Summary
          </button>
          <button
            onClick={() => { setEditEntry(null); setModalOpen(true); }}
            style={{ padding: "8px 16px", background: "#2563EB", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
          >
            + Add Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "white", borderRadius: 12, padding: 16, marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Client</label>
          <select
            value={filters.clientId}
            onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
          >
            <option value="">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.fullName}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Payment Status</label>
          <select
            value={filters.paymentStatus}
            onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="AUTHORIZED">Authorized</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: "white", borderRadius: 12, padding: 16, marginBottom: 24, display: "flex", gap: 24 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#666" }}>Total Entries</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 20, fontWeight: "bold" }}>{logs.length}</p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#666" }}>Total Amount</p>
          <p style={{ margin: "4px 0 0 0", fontSize: 20, fontWeight: "bold" }}>{money(totalAmount)}</p>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "white", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 24, textAlign: "center", color: "#666" }}>Loading...</p>
        ) : logs.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", color: "#666" }}>No transportation logs found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f9fafb", borderBottom: "1px solid #ddd" }}>
              <tr>
                <th style={{ textAlign: "left", padding: 12, fontWeight: 600, fontSize: 12 }}>Date</th>
                <th style={{ textAlign: "left", padding: 12, fontWeight: 600, fontSize: 12 }}>Client</th>
                <th style={{ textAlign: "left", padding: 12, fontWeight: 600, fontSize: 12 }}>Description</th>
                <th style={{ textAlign: "right", padding: 12, fontWeight: 600, fontSize: 12 }}>Amount</th>
                <th style={{ textAlign: "center", padding: 12, fontWeight: 600, fontSize: 12 }}>Status</th>
                <th style={{ textAlign: "center", padding: 12, fontWeight: 600, fontSize: 12 }}>Paid By</th>
                <th style={{ textAlign: "center", padding: 12, fontWeight: 600, fontSize: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 12, fontSize: 13 }}>{fmtDate(log.serviceDate)}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{log.client?.fullName || "—"}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>{log.description || "—"}</td>
                  <td style={{ padding: 12, fontSize: 13, textAlign: "right", fontWeight: 500 }}>{money(log.amount)}</td>
                  <td style={{ padding: 12, fontSize: 13, textAlign: "center" }}>
                    <StatusPill status={log.paymentStatus} />
                  </td>
                  <td style={{ padding: 12, fontSize: 13, textAlign: "center" }}>{log.paidBy || "—"}</td>
                  <td style={{ padding: 12, fontSize: 12, textAlign: "center" }}>
                    <button
                      onClick={() => { setEditEntry(log); setModalOpen(true); }}
                      style={{ background: "none", border: "none", color: "#2563EB", cursor: "pointer", marginRight: 8, fontWeight: 500 }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(log.id)}
                      style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontWeight: 500 }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen && <TransportationModal entry={editEntry} clients={clients} onClose={() => { setModalOpen(false); setEditEntry(null); }} onSave={handleSave} />}
    </div>
  );
}
