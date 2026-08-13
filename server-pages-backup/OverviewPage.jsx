import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";

const DASHBOARD_CACHE_KEY = "aplus_dashboard_stats_v1";
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

function LineTrendChart({ points }) {
  if (!points?.length) return <p className="text-sm text-slate-500">No trend data.</p>;

  const width = 560;
  const height = 200;
  const padding = 28;
  const maxValue = Math.max(...points.map((p) => p.hours), 1);
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = padding + index * xStep;
    const y = height - padding - (point.hours / maxValue) * (height - padding * 2);
    return { x, y };
  });
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div className="w-full overflow-auto">
      <svg width={width} height={height} role="img" aria-label="Scheduled hours trend">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" />
        <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={polylinePoints} />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill="#1d4ed8" />
        ))}
        <text x={padding} y={height - 8} fontSize="11" fill="#64748b">
          {new Date(points[0].date).toLocaleDateString()}
        </text>
        <text x={width - padding} y={height - 8} textAnchor="end" fontSize="11" fill="#64748b">
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
    <div className="flex flex-col md:flex-row gap-4 items-center">
      <svg width="170" height="170" viewBox="0 0 170 170" aria-label="Status breakdown chart">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="16" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#16a34a" strokeWidth="16" strokeDasharray={`${completedLen} ${circumference}`} strokeDashoffset="0" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#dc2626" strokeWidth="16" strokeDasharray={`${cancelledLen} ${circumference}`} strokeDashoffset={-completedLen} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2563eb" strokeWidth="16" strokeDasharray={`${otherLen} ${circumference}`} strokeDashoffset={-(completedLen + cancelledLen)} />
        </g>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="16" fill="#0f172a">{total}</text>
      </svg>
      <div className="text-sm space-y-1">
        <p><span className="inline-block w-3 h-3 bg-green-600 mr-2 rounded-sm" />Completed: {completed}</p>
        <p><span className="inline-block w-3 h-3 bg-red-600 mr-2 rounded-sm" />Cancelled: {cancelled}</p>
        <p><span className="inline-block w-3 h-3 bg-blue-600 mr-2 rounded-sm" />Scheduled/Rescheduled: {other}</p>
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
    rangeStart: "",
    rangeEnd: ""
  });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">A+ Center Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Operations snapshot for scheduling, reporting, and billing.</p>
      </div>
      <div className="card">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Range</span>
            <select
              className="saas-input"
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value)}
            >
              <option value="this_week">This week</option>
              <option value="last_week">Last week</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {rangePreset === "custom" && (
            <>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Start</span>
                <input
                  className="saas-input"
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">End</span>
                <input
                  className="saas-input"
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            </>
          )}
          <button
            className="btn-primary"
            onClick={() => fetchStats(rangePreset, customStart, customEnd)}
          >
            {isRefreshing ? "Refreshing..." : "Apply Range"}
          </button>
          <span className="text-sm text-slate-600">Current: {rangeLabel}</span>
          {lastUpdated && (
            <span className="text-xs text-slate-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <h3 className="text-slate-600">Today's Appointments</h3>
          <p className="text-3xl font-bold text-primary-600">{isInitialLoading ? "..." : stats.todaysAppointmentsCount}</p>
        </div>
        <div className="card">
          <h3 className="text-slate-600">Cancellations ({rangeLabel})</h3>
          <p className="text-3xl font-bold text-primary-600">{isInitialLoading ? "..." : stats.cancellationsThisWeekCount}</p>
        </div>
        <div className="card">
          <h3 className="text-slate-600">Pending Invoices</h3>
          <p className="text-3xl font-bold text-primary-600">{isInitialLoading ? "..." : stats.pendingInvoicesCount}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="text-slate-600">Upcoming Appointments</h3>
          <p className="text-3xl font-bold text-primary-600">{stats.upcomingAppointmentsCount}</p>
        </div>
        <div className="card">
          <h3 className="text-slate-600">Overdue Reports</h3>
          <p className="text-3xl font-bold text-primary-600">{stats.overdueReportsCount}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <h3 className="text-slate-600">Scheduled Hours ({rangeLabel})</h3>
          <p className="text-3xl font-bold text-primary-600">{stats.weeklyScheduledHours}</p>
        </div>
        <div className="card">
          <h3 className="text-slate-600">Completed ({rangeLabel})</h3>
          <p className="text-3xl font-bold text-primary-600">{stats.completedThisWeekCount}</p>
          <p className="text-sm text-slate-500 mt-1">Completion rate: {stats.completionRatePct}%</p>
        </div>
        <div className="card">
          <h3 className="text-slate-600">Cancellation Rate</h3>
          <p className="text-3xl font-bold text-primary-600">{stats.cancellationRatePct}%</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-slate-700 font-semibold">BCBA Workload ({rangeLabel})</h3>
          <button className="btn-secondary py-2" onClick={exportWorkloadCsv}>
            Export Workload CSV
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">BCBA</th>
                <th className="py-2 pr-2">Sessions</th>
                <th className="py-2 pr-2">Hours</th>
              </tr>
            </thead>
            <tbody>
              {stats.bcbaWorkload.length === 0 && (
                <tr>
                  <td className="py-2 pr-2 text-slate-500" colSpan={3}>No workload data for selected range.</td>
                </tr>
              )}
              {stats.bcbaWorkload.map((row) => (
                <tr key={row.bcbaId} className="border-b">
                  <td className="py-2 pr-2">{row.bcbaName}</td>
                  <td className="py-2 pr-2">{row.scheduledCount}</td>
                  <td className="py-2 pr-2">{row.scheduledHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-slate-700 font-semibold mb-2">Scheduled Hours Trend ({rangeLabel})</h3>
          <LineTrendChart points={stats.dailyScheduledHoursTrend} />
        </div>
        <div className="card">
          <h3 className="text-slate-700 font-semibold mb-2">Status Breakdown ({rangeLabel})</h3>
          <DonutStatusChart breakdown={stats.statusBreakdown} />
        </div>
      </div>

      <div>
        <Link to="/aplus/intake" className="btn-primary">
          Download Intake Form
        </Link>
      </div>
    </div>
  );
}
