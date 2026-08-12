import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";

const DASHBOARD_CACHE_KEY = "aplus_dashboard_stats_v1";
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

function LineTrendChart({ points }) {
  if (!points?.length) return <p className="text-sm text-slate-400 py-8 text-center">No trend data.</p>;

  const width = 560;
  const height = 200;
  const padding = 32;
  const maxValue = Math.max(...points.map((p) => p.hours), 1);
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = padding + index * xStep;
    const y = height - padding - (point.hours / maxValue) * (height - padding * 2);
    return { x, y };
  });
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  // Build smooth area path
  const areaPath = coords.length > 1
    ? `M${coords[0].x},${height - padding} ` +
      coords.map((c) => `L${c.x},${c.y}`).join(" ") +
      ` L${coords[coords.length - 1].x},${height - padding} Z`
    : "";

  const gradId = "trendGrad";

  return (
    <div className="w-full overflow-auto">
      <svg width={width} height={height} role="img" aria-label="Scheduled hours trend">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Soft grid lines */}
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding + (1 - t) * (height - padding * 2);
          return <line key={t} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#F1F5F9" strokeWidth="1" />;
        })}
        {/* Gradient area fill */}
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {/* Baseline */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#E2E8F0" strokeWidth="1" />
        {/* Line */}
        <polyline fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={polylinePoints} />
        {/* Dots */}
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="4" fill="white" stroke="#3B82F6" strokeWidth="2" />
        ))}
        {/* Date labels */}
        <text x={padding} y={height - 10} fontSize="10" fill="#94A3B8">
          {new Date(points[0].date).toLocaleDateString()}
        </text>
        <text x={width - padding} y={height - 10} textAnchor="end" fontSize="10" fill="#94A3B8">
          {new Date(points[points.length - 1].date).toLocaleDateString()}
        </text>
      </svg>
    </div>
  );
}

function DonutStatusChart({ breakdown }) {
  const completed = Number(breakdown?.COMPLETED || 0);
  const cancelled = Number(breakdown?.CANCELLED || 0);
  const scheduled = Number(breakdown?.SCHEDULED || 0);
  const rescheduled = Number(breakdown?.RESCHEDULED || 0);
  const other = scheduled + rescheduled;
  const total = completed + cancelled + other;
  if (!total) return <p className="text-sm text-slate-500">No status data.</p>;

  const cx = 80;
  const cy = 80;
  const r = 56;
  const circumference = 2 * Math.PI * r;
  const completedLen = (completed / total) * circumference;
  const cancelledLen = (cancelled / total) * circumference;
  const otherLen = circumference - completedLen - cancelledLen;

  return (
    <div className="flex flex-col md:flex-row gap-6 items-center">
      <svg width="170" height="170" viewBox="0 0 170 170" aria-label="Status breakdown chart">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth="14" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22C55E" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${completedLen} ${circumference}`} strokeDashoffset="0" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF4444" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${cancelledLen} ${circumference}`} strokeDashoffset={-completedLen} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3B82F6" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${otherLen} ${circumference}`} strokeDashoffset={-(completedLen + cancelledLen)} />
        </g>
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill="#0F172A">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#94A3B8">total</text>
      </svg>
      <div className="space-y-3">
        {[
          { color: "#22C55E", bg: "#F0FDF4", label: "Completed", value: completed },
          { color: "#EF4444", bg: "#FEF2F2", label: "Cancelled",  value: cancelled },
          { color: "#3B82F6", bg: "#EFF6FF", label: "Scheduled / Rescheduled", value: other },
        ].map(({ color, bg, label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <div style={{ background: bg, borderRadius: 8, padding: "6px 10px", minWidth: 40, textAlign: "center" }}>
              <span style={{ color, fontWeight: 700, fontSize: 15 }}>{value}</span>
            </div>
            <span style={{ fontSize: 13, color: "#64748B" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState("this_week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stats, setStats] = useState({
    upcomingAppointmentsCount: 0,
    overdueReportsCount: 0,
    todaysAppointmentsCount: 0,
    cancellationsThisWeekCount: 0,
    pendingInvoicesCount: 0,
    weeklyScheduledHours: 0,
    completedThisWeekCount: 0,
    completionRatePct: 0,
    cancellationRatePct: 0,
    statusBreakdown: { SCHEDULED: 0, COMPLETED: 0, CANCELLED: 0, RESCHEDULED: 0 },
    dailyScheduledHoursTrend: [],
    bcbaWorkload: [],
    overdueReports: [],
    rangeStart: "",
    rangeEnd: ""
  });
  const [showOverduePopover, setShowOverduePopover] = useState(false);
  const overdueCardRef = useRef(null);

  const fetchStats = async (nextPreset = rangePreset, start = customStart, end = customEnd) => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.set("rangePreset", nextPreset);
      if (nextPreset === "custom" && start && end) {
        params.set("startDate", new Date(start).toISOString());
        params.set("endDate", new Date(end).toISOString());
      }
      const { data } = await api.get(`/dashboard/stats?${params.toString()}`);
      setStats(data);
      setLastUpdated(new Date());
      try {
        sessionStorage.setItem(
          DASHBOARD_CACHE_KEY,
          JSON.stringify({
            cachedAt: Date.now(),
            rangePreset: nextPreset,
            customStart: start,
            customEnd: end,
            stats: data
          })
        );
      } catch {
        // Ignore storage issues in restricted browser contexts.
      }
    } finally {
      setIsRefreshing(false);
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const age = Date.now() - Number(parsed.cachedAt || 0);
        if (age >= 0 && age <= DASHBOARD_CACHE_TTL_MS && parsed.stats) {
          if (parsed.rangePreset) setRangePreset(parsed.rangePreset);
          if (parsed.customStart) setCustomStart(parsed.customStart);
          if (parsed.customEnd) setCustomEnd(parsed.customEnd);
          setStats(parsed.stats);
          setLastUpdated(new Date(Number(parsed.cachedAt)));
          setIsInitialLoading(false);
          fetchStats(parsed.rangePreset || "this_week", parsed.customStart || "", parsed.customEnd || "").catch(() => {});
          return;
        }
      }
    } catch {
      // Ignore parse/storage errors and do normal fetch.
    }
    fetchStats().catch(() => {});
  }, []);

  const rangeLabel = stats.rangePreset === "last_week"
    ? "Last Week"
    : stats.rangePreset === "custom"
      ? "Custom Range"
      : "This Week";

  const exportWorkloadCsv = () => {
    const headers = ["BCBA", "Sessions", "Hours"];
    const rows = stats.bcbaWorkload.map((row) => [row.bcbaName, row.scheduledCount, row.scheduledHours]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bcba-workload-${stats.rangePreset || "range"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // KPI card helper — purely visual wrapper, all data unchanged
  const KpiCard = ({ label, value, accent = "#2563EB", bg = "#EFF6FF", icon }) => (
    <div className="card card-hover" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{label}</p>
        {icon && (
          <div style={{ background: bg, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={icon} />
            </svg>
          </div>
        )}
      </div>
      <p style={{ fontSize: 40, fontWeight: 700, color: "#0F172A", lineHeight: 1, marginBottom: 4 }}>
        {isInitialLoading ? <span style={{ fontSize: 28, color: "#CBD5E1" }}>—</span> : value}
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0F172A", margin: 0 }}>A+ Center Overview</h1>
        <p style={{ marginTop: 4, fontSize: 13, color: "#94A3B8" }}>Operations snapshot for scheduling, reporting, and billing.</p>
      </div>

      {/* Range filter card */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <label style={{ fontSize: 13 }}>
            <span style={{ display: "block", color: "#64748B", marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Range</span>
            <select className="saas-input" style={{ width: 148 }} value={rangePreset} onChange={(e) => setRangePreset(e.target.value)}>
              <option value="this_week">This week</option>
              <option value="last_week">Last week</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {rangePreset === "custom" && (
            <>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", color: "#64748B", marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Start</span>
                <input className="saas-input" type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </label>
              <label style={{ fontSize: 13 }}>
                <span style={{ display: "block", color: "#64748B", marginBottom: 4, fontWeight: 500, fontSize: 12 }}>End</span>
                <input className="saas-input" type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </label>
            </>
          )}
          <button className="btn-primary" onClick={() => fetchStats(rangePreset, customStart, customEnd)}>
            {isRefreshing ? "Refreshing…" : "Apply Range"}
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, justifyContent: "flex-end" }}>
            <span style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>Current: {rangeLabel}</span>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: "#94A3B8" }}>Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Row 1 KPIs */}
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <KpiCard label="Today's Appointments" value={stats.todaysAppointmentsCount}
          accent="#2563EB" bg="#EFF6FF" icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
        <KpiCard label="Upcoming Appointments" value={stats.upcomingAppointmentsCount}
          accent="#7C3AED" bg="#F5F3FF" icon="M12 8v4l3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
        <KpiCard label={`Cancellations (${rangeLabel})`} value={stats.cancellationsThisWeekCount}
          accent="#EF4444" bg="#FEF2F2" icon="M18.364 5.636 5.636 18.364M18.364 18.364 5.636 5.636" />
        <KpiCard label="Pending Invoices" value={stats.pendingInvoicesCount}
          accent="#F59E0B" bg="#FFFBEB" icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8" />
        <KpiCard label={`Scheduled Hours (${rangeLabel})`} value={stats.weeklyScheduledHours}
          accent="#0D9488" bg="#F0FDFA" icon="M12 8v4l3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
        <KpiCard label={`Completed (${rangeLabel})`} value={stats.completedThisWeekCount}
          accent="#22C55E" bg="#F0FDF4" icon="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </div>

      {/* Row 2 — Rate cards */}
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="card card-hover" style={{ padding: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", marginBottom: 16 }}>Completion Rate</p>
          <p style={{ fontSize: 40, fontWeight: 700, color: "#22C55E", lineHeight: 1 }}>{stats.completionRatePct}<span style={{ fontSize: 20, fontWeight: 600, color: "#94A3B8" }}>%</span></p>
        </div>
        <div className="card card-hover" style={{ padding: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", marginBottom: 16 }}>Cancellation Rate</p>
          <p style={{ fontSize: 40, fontWeight: 700, color: "#EF4444", lineHeight: 1 }}>{stats.cancellationRatePct}<span style={{ fontSize: 20, fontWeight: 600, color: "#94A3B8" }}>%</span></p>
        </div>
        <div
          ref={overdueCardRef}
          className="card card-hover"
          style={{ position: "relative", padding: 24 }}
          onMouseEnter={() => setShowOverduePopover(true)}
          onMouseLeave={() => setShowOverduePopover(false)}
        >
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", marginBottom: 16 }}>Overdue Reports</p>
          <p style={{ fontSize: 40, fontWeight: 700, color: "#F59E0B", lineHeight: 1 }}>{stats.overdueReportsCount}</p>
          {showOverduePopover && (stats.overdueReports?.length > 0) && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "100%",
                marginTop: 4,
                zIndex: 50,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 10px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",
                padding: "12px 0",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", padding: "0 16px 8px" }}>Reports due from these appointments</p>
              {(stats.overdueReports || []).map((r) => {
                const dateStr = r.startsAt ? new Date(r.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
                const timeStr = r.startsAt ? new Date(r.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
                return (
                  <Link
                    key={r.id}
                    to="/aplus/appointments"
                    style={{
                      display: "block",
                      padding: "10px 16px",
                      fontSize: 13,
                      color: "#334155",
                      textDecoration: "none",
                      borderBottom: "1px solid #F1F5F9",
                    }}
                    onMouseEnter={() => setShowOverduePopover(true)}
                    onMouseLeave={() => setShowOverduePopover(false)}
                  >
                    <span style={{ fontWeight: 600 }}>{r.clientName || "Unknown client"}</span>
                    {r.serviceName && <span style={{ color: "#64748B" }}> · {r.serviceName}</span>}
                    <br />
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>{dateStr}{timeStr ? ` at ${timeStr}` : ""}</span>
                  </Link>
                );
              })}
            </div>
          )}
          {showOverduePopover && stats.overdueReportsCount === 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "100%",
                marginTop: 4,
                zIndex: 50,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 10px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",
                padding: 12,
                fontSize: 13,
                color: "#64748B",
              }}
            >
              No overdue reports.
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Scheduled Hours Trend</p>
            <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{rangeLabel}</p>
          </div>
          <LineTrendChart points={stats.dailyScheduledHoursTrend} />
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Appointment Status Breakdown</p>
            <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{rangeLabel}</p>
          </div>
          <DonutStatusChart breakdown={stats.statusBreakdown} />
        </div>
      </div>

      {/* BCBA Workload */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 24px", borderBottom: "1px solid #F1F5F9" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>BCBA Workload</p>
            <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{rangeLabel}</p>
          </div>
          <button className="btn-secondary" style={{ fontSize: 12, padding: "6px 14px", height: "auto" }} onClick={exportWorkloadCsv}>
            Export CSV
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ textAlign: "left", padding: "10px 24px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>BCBA</th>
                <th style={{ textAlign: "left", padding: "10px 24px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Sessions</th>
                <th style={{ textAlign: "left", padding: "10px 24px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {stats.bcbaWorkload.length === 0 && (
                <tr>
                  <td style={{ padding: "20px 24px", color: "#94A3B8", fontSize: 13 }} colSpan={3}>No workload data for selected range.</td>
                </tr>
              )}
              {stats.bcbaWorkload.map((row) => (
                <tr key={row.bcbaId} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "12px 24px", fontWeight: 500, color: "#1E293B" }}>{row.bcbaName}</td>
                  <td style={{ padding: "12px 24px", color: "#475569" }}>{row.scheduledCount}</td>
                  <td style={{ padding: "12px 24px", color: "#475569" }}>{row.scheduledHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intake form link */}
      <div>
        <Link to="/aplus/intake" className="btn-primary">
          Download Intake Form
        </Link>
      </div>
    </div>
  );
}
