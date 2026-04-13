"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area,
} from "recharts";
import {
  ArrowLeft, BookOpen, Brain, Calendar, ChevronRight, ClipboardList, Edit2,
  FileText, Target, TrendingUp, User, Share2, Play, Layers,
  CheckCircle2, Circle, Clock, Star, Plus, Activity, StickyNote,
  BarChart2, LayoutGrid, Zap,
} from "lucide-react";
import { useState, Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { TargetDetailPanel, type TargetPanelData } from "./_components/TargetDetailPanel";
import { ProgramsTab } from "./_components/ProgramsTab";
import { DataEntryTab } from "./_components/DataEntryTab";

/* ── Types ── */

type ClientDetail = {
  id: string;
  name: string;
  photoUrl?: string | null;
  dob: string;
  age: number;
  diagnosis: string[];
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  school?: string | null;
  assignedRbt?: string;
  assignedBcba?: string;
  masteredTargets: number;
  totalTargets: number;
  progressPct: number;
  sessionsThisWeek: number;
  lastSessionAt?: string;
  chartData: { date: string; correct: number; total: number; pct: number }[];
  behaviorBreakdown: { name: string; count: number }[];
};

type Session = {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  trialCount: number;
  pctCorrect?: number;
  therapistName?: string | null;
};

type GoalSummary = {
  id: string;
  title: string;
  domain?: string | null;
  status: string;
  targetCount: number;
  masteredCount: number;
};

const TABS = [
  { id: "overview",    label: "Overview",          icon: LayoutGrid },
  { id: "data-entry",  label: "Data Entry",         icon: Zap        },
  { id: "programs",    label: "Goals & Targets",    icon: Target     },
  { id: "sessions",    label: "Sessions",           icon: Activity   },
  { id: "schedule",    label: "Schedule",           icon: Calendar   },
  { id: "graphs",      label: "Graphs",             icon: BarChart2  },
  { id: "notes",       label: "Notes",              icon: StickyNote },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PHASE_COLORS: Record<string, string> = {
  BASELINE: "bg-zinc-500/20 text-zinc-400",
  ACQUISITION: "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]",
  MAINTENANCE: "bg-amber-400/10 text-amber-400",
  GENERALIZATION: "bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]",
  MASTERED: "bg-emerald-400/10 text-emerald-400",
};

/* ── Error boundary for tab content ── */

class TabErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] crash:`, error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/5 p-6">
          <p className="text-sm font-semibold text-[var(--accent-pink)] mb-2">
            Error in {this.props.label}
          </p>
          <pre className="text-xs text-zinc-400 whitespace-pre-wrap break-all font-mono bg-black/30 rounded-xl p-4 max-h-48 overflow-y-auto">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-xl px-4 py-2 text-sm text-zinc-400 border border-[var(--glass-border)] hover:text-zinc-200 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Schedule tab component ── */

type ScheduleAppointmentData = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  title: string | null;
  location: string | null;
  serviceName: string | null;
  providerName: string | null;
  durationMinutes: number | null;
};

const APPT_STATUS_STYLE: Record<string, string> = {
  SCHEDULED: "text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10",
  COMPLETED:  "text-emerald-400 bg-emerald-400/10",
  CANCELLED:  "text-[var(--accent-pink)] bg-[var(--accent-pink)]/10",
};

function ApptCard({ appt }: { appt: ScheduleAppointmentData }) {
  const start       = new Date(appt.startsAt);
  const end         = appt.endsAt ? new Date(appt.endsAt) : null;
  const statusClass = APPT_STATUS_STYLE[appt.status] ?? "text-zinc-400 bg-zinc-400/10";
  return (
    <div className="glass-card rounded-2xl p-4 flex items-start gap-4">
      <div className="flex flex-col items-center justify-center shrink-0 rounded-xl bg-[var(--accent-cyan)]/10 p-3 min-w-[56px]">
        <span className="text-[var(--accent-cyan)] text-lg font-bold leading-none">{start.getDate()}</span>
        <span className="text-[var(--accent-cyan)] text-xs uppercase font-semibold">
          {start.toLocaleString("default", { month: "short" })}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="font-semibold text-[var(--foreground)] text-sm">
            {appt.title ?? appt.serviceName ?? "Appointment"}
          </p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
            {appt.status.charAt(0) + appt.status.slice(1).toLowerCase()}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-zinc-500">
          <span>
            {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            {end && ` – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
            {!end && appt.durationMinutes && ` (${appt.durationMinutes} min)`}
          </span>
          {appt.providerName && <span>Provider: {appt.providerName}</span>}
          {appt.serviceName && <span>{appt.serviceName}</span>}
          {appt.location && <span>{appt.location}</span>}
        </div>
      </div>
    </div>
  );
}

function ScheduleTab({
  appointments,
  configured,
}: {
  clientId: string;
  appointments: ScheduleAppointmentData[] | null;
  configured: boolean | null;
}) {
  if (appointments === null) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-20 rounded-2xl" />)}
      </div>
    );
  }
  if (!configured) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
        <Calendar className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400 font-medium mb-1">Scheduling not linked</p>
        <p className="text-zinc-600 text-sm max-w-xs mx-auto">
          Set <code className="text-zinc-500">SCHEDULING_DATABASE_URL</code> in your Smart Steps environment to connect to the scheduling system.
        </p>
      </div>
    );
  }
  if (appointments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
        <Calendar className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400 font-medium mb-1">No appointments found</p>
        <p className="text-zinc-600 text-sm">No scheduling appointments matched for this client.</p>
      </div>
    );
  }
  const now      = new Date();
  const upcoming = appointments.filter((a) => new Date(a.startsAt) >= now);
  const past     = appointments.filter((a) => new Date(a.startsAt) < now);
  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">Appointments from the scheduling system</p>
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Upcoming ({upcoming.length})
          </h3>
          <div className="space-y-2">
            {upcoming.map((a) => <ApptCard key={a.id} appt={a} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Past ({past.length})
          </h3>
          <div className="space-y-2 opacity-80">
            {past.slice(0, 10).map((a) => <ApptCard key={a.id} appt={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Inner page (uses useSearchParams) ── */

function ClientHubInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: authSession } = useSession();
  const role = (authSession?.user as { role?: string })?.role;
  const qc = useQueryClient();

  const clientId = String(params.clientId ?? "");
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam ?? "overview");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<TargetPanelData | null>(null);

  function setTab(t: TabId) {
    setActiveTab(t);
    router.replace(`/clients/${clientId}?tab=${t}`, { scroll: false });
  }

  function handleOpenTarget(t: TargetPanelData) {
    setSelectedTarget(t);
  }

  /* ── Data fetching ── */

  const { data: client, isLoading, error } = useQuery<ClientDetail>({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Failed to load client");
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["sessions", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/sessions?clientId=${clientId}&limit=20`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 0,           // Always treat as stale so it refetches on mount
    refetchOnMount: true,
  });

  const { data: scheduleData } = useQuery<{ appointments: ScheduleAppointmentData[]; configured: boolean }>({
    queryKey: ["schedule", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/schedule`);
      if (!res.ok) return { appointments: [], configured: false };
      return res.json();
    },
    enabled: !!clientId && activeTab === "schedule",
    staleTime: 60_000,
  });

  // goals-summary kept for potential overview stats; not rendered directly (ProgramsTab handles rendering)
  useQuery<GoalSummary[]>({
    queryKey: ["goals-summary", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/goals`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((g: GoalSummary & { targets?: { phase: string }[]; subGoals?: { targets: { phase: string }[] }[] }) => ({
        id: g.id,
        title: g.title,
        domain: g.domain,
        status: g.status,
        targetCount: (g.targets?.length ?? 0) + (g.subGoals?.flatMap((sg) => sg.targets).length ?? 0),
        masteredCount: [...(g.targets ?? []), ...(g.subGoals?.flatMap((sg) => sg.targets) ?? [])].filter((t) => t.phase === "MASTERED").length,
      }));
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  async function generateParentLink() {
    setGeneratingLink(true);
    try {
      const res = await fetch("/smart-steps/api/parent/generate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, expiryDays: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await navigator.clipboard.writeText(data.url).catch(() => {});
      toast.success("Parent link copied! Valid for 30 days.");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setGeneratingLink(false);
    }
  }

  if (isLoading || !client) {
    return (
      <div className="p-6 md:p-8">
        <div className="glass-card skeleton h-28 w-full rounded-2xl mb-4" />
        <div className="glass-card skeleton h-12 w-full rounded-xl mb-6" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="glass-card skeleton h-24 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <div className="glass-card rounded-2xl p-8 text-center border border-[var(--accent-pink)]/30">
          <p className="text-[var(--accent-pink)] font-medium">Failed to load client profile</p>
          <p className="text-zinc-500 text-sm mt-1">Check your database connection or try refreshing.</p>
        </div>
      </div>
    );
  }

  const progressPct = client.progressPct ?? 0;

  return (
    <div className="p-6 md:p-8">
      {/* ── Client header ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <Link
            href="/clients"
            className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="relative h-16 w-16 shrink-0">
            <div className="h-16 w-16 overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--accent-cyan)]/20 to-[var(--accent-purple)]/20 flex items-center justify-center text-2xl font-bold text-[var(--accent-cyan)]">
              {client.photoUrl
                ? <img src={client.photoUrl} alt="" className="h-full w-full object-cover" />
                : client.name.charAt(0).toUpperCase()
              }
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-emerald-400 border-2 border-[var(--background)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{client.name}</h1>
            <p className="text-sm text-zinc-500">
              Age {client.age}
              {client.diagnosis.length > 0 && ` · ${client.diagnosis.slice(0, 2).join(", ")}`}
            </p>
            {(client.assignedRbt || client.assignedBcba) && (
              <p className="text-xs text-zinc-500">
                {client.assignedRbt && `RBT: ${client.assignedRbt}`}
                {client.assignedBcba && ` · BCBA: ${client.assignedBcba}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={generateParentLink}
            disabled={generatingLink}
            className="btn-secondary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" />
            {generatingLink ? "…" : "Parent link"}
          </button>
          <Link
            href={`/clients/${clientId}/edit`}
            className="btn-secondary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </Link>
          <button
            type="button"
            onClick={() => setTab("data-entry")}
            className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
          >
            <Zap className="h-4 w-4" />
            Data Entry
          </button>
        </div>
      </motion.div>

      {/* ── Progress banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-4"
      >
        <div className="flex-1">
          <div className="flex justify-between mb-1.5 text-sm">
            <span className="text-zinc-400">Overall progress</span>
            <span className="font-semibold text-[var(--accent-cyan)]">{progressPct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--glass-border)] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            />
          </div>
        </div>
        <div className="text-center shrink-0">
          <p className="text-2xl font-bold text-[var(--foreground)]">{client.masteredTargets}/{client.totalTargets}</p>
          <p className="text-xs text-zinc-500">targets mastered</p>
        </div>
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="mb-6"
      >
        <div className="flex gap-1 overflow-x-auto scrollbar-hide rounded-xl bg-[var(--glass-bg)] p-1 border border-[var(--glass-border)]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: Target, label: "Targets mastered", value: `${client.masteredTargets}/${client.totalTargets}`, color: "var(--accent-cyan)" },
                  { icon: TrendingUp, label: "Progress", value: `${progressPct}%`, color: "var(--accent-purple)" },
                  { icon: Calendar, label: "Sessions this week", value: String(client.sessionsThisWeek), color: "var(--accent-pink)" },
                  { icon: User, label: "Guardian", value: client.guardianName ?? "—", color: "#34d399" },
                ].map((stat) => (
                  <div key={stat.label} className="glass-card flex items-center gap-4 rounded-2xl p-4">
                    <div className="rounded-xl p-2.5 shrink-0" style={{ background: `color-mix(in srgb, ${stat.color} 15%, transparent)` }}>
                      <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-[var(--foreground)] truncate max-w-[110px]">{stat.value}</p>
                      <p className="text-xs text-zinc-500">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Client info */}
              {(client.guardianEmail || client.guardianPhone || client.school) && (
                <div className="glass-card rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-3">Contact &amp; Info</h3>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    {client.guardianEmail && (
                      <div>
                        <p className="text-xs text-zinc-500">Guardian email</p>
                        <p className="text-zinc-200">{client.guardianEmail}</p>
                      </div>
                    )}
                    {client.guardianPhone && (
                      <div>
                        <p className="text-xs text-zinc-500">Guardian phone</p>
                        <p className="text-zinc-200">{client.guardianPhone}</p>
                      </div>
                    )}
                    {client.school && (
                      <div>
                        <p className="text-xs text-zinc-500">School</p>
                        <p className="text-zinc-200">{client.school}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nav grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { href: `/clients/${clientId}/programs`, icon: Target, label: "Goals & Targets", sub: "Skill areas, programs & targets", color: "var(--accent-cyan)" },
                  { href: `/clients/${clientId}/assessments`, icon: ClipboardList, label: "Assessments", sub: "Assign and complete", color: "var(--accent-purple)" },
                  { href: `/clients/${clientId}/behavior-plan`, icon: Brain, label: "Behavior Plan", sub: "BIP and interventions", color: "#34d399" },
                  { href: `/clients/${clientId}?tab=data-entry`, icon: Zap, label: "Data Entry", sub: "Live session recording", color: "#f59e0b" },
                  { href: `/reports?clientId=${clientId}`, icon: FileText, label: "Reports", sub: "Export and analyze", color: "#a78bfa" },
                ].map((item) => (
                  <Link key={item.href} href={item.href}>
                    <motion.div
                      whileHover={{ y: -2 }}
                      className="glass-card flex items-center gap-3 rounded-2xl p-4 hover:shadow-[var(--glow-cyan)] transition-shadow cursor-pointer"
                    >
                      <div className="rounded-xl p-2.5 shrink-0" style={{ background: `color-mix(in srgb, ${item.color} 15%, transparent)` }}>
                        <item.icon className="h-5 w-5" style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--foreground)] text-sm">{item.label}</p>
                        <p className="text-xs text-zinc-500 truncate">{item.sub}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                    </motion.div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* DATA ENTRY TAB */}
          {activeTab === "data-entry" && (
            <TabErrorBoundary label="Data Entry">
              <DataEntryTab clientId={clientId} />
            </TabErrorBoundary>
          )}

          {/* GOALS & TARGETS TAB */}
          {activeTab === "programs" && (
            <TabErrorBoundary label="Goals & Targets">
              <ProgramsTab clientId={clientId} onOpenTarget={handleOpenTarget} />
            </TabErrorBoundary>
          )}

          {/* SESSIONS TAB */}
          {activeTab === "sessions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">
                  {sessions.length} recent session{sessions.length !== 1 ? "s" : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setTab("data-entry")}
                  className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  <Zap className="h-4 w-4" /> New Session
                </button>
              </div>
              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-12 text-center">
                  <Activity className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium mb-1">No sessions recorded yet</p>
                  <button
                    type="button"
                    onClick={() => setTab("data-entry")}
                    className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold mt-4"
                  >
                    <Zap className="h-4 w-4" /> Start first session
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <div key={s.id} className="glass-card rounded-2xl p-4 flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10">
                        <Activity className="h-5 w-5 text-[var(--accent-cyan)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--foreground)] text-sm">
                          {new Date(s.startedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {s.trialCount} trial{s.trialCount !== 1 ? "s" : ""}
                          {s.therapistName && ` · ${s.therapistName}`}
                          {s.endedAt && ` · ${Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)} min`}
                        </p>
                      </div>
                      {s.pctCorrect != null && (
                        <span className={`text-sm font-bold shrink-0 ${s.pctCorrect >= 80 ? "text-emerald-400" : s.pctCorrect >= 60 ? "text-amber-400" : "text-[var(--accent-pink)]"}`}>
                          {Math.round(s.pctCorrect)}%
                        </span>
                      )}
                      <Clock className="h-4 w-4 text-zinc-600 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SCHEDULE TAB */}
          {activeTab === "schedule" && (
            <ScheduleTab
              clientId={clientId}
              appointments={scheduleData?.appointments ?? null}
              configured={scheduleData?.configured ?? null}
            />
          )}

          {/* GRAPHS TAB */}
          {activeTab === "graphs" && (
            <div className="space-y-6">
              {client.chartData.some((d) => d.total > 0) ? (
                <>
                  <div className="glass-card rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-[var(--accent-cyan)]" />
                      % Correct — last 5 days
                    </h3>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={client.chartData}>
                          <defs>
                            <linearGradient id="gradCyan" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                          <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 12 }}
                            formatter={(v) => [`${v}%`, "% Correct"]}
                          />
                          <Area type="monotone" dataKey="pct" stroke="var(--accent-cyan)" strokeWidth={2.5} fill="url(#gradCyan)" dot={{ fill: "var(--accent-cyan)", r: 4 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                      <BarChart2 className="h-4 w-4 text-[var(--accent-purple)]" />
                      Trials per day
                    </h3>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={client.chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                          <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} />
                          <Tooltip contentStyle={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 12 }} />
                          <Bar dataKey="correct" name="Correct" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="total" name="Total" fill="var(--accent-purple)" opacity={0.4} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                  <BarChart2 className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 font-medium mb-1">No data yet</p>
                  <p className="text-zinc-600 text-sm">Record sessions to see graphs here.</p>
                </div>
              )}

              {client.behaviorBreakdown.length > 0 && (
                <div className="glass-card rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-4">Trial result breakdown</h3>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={client.behaviorBreakdown} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                        <XAxis type="number" stroke="#71717a" fontSize={11} />
                        <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={11} width={80} />
                        <Tooltip contentStyle={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 12 }} />
                        <Bar dataKey="count" fill="var(--accent-purple)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">Session &amp; progress notes</p>
              </div>
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <StickyNote className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium mb-1">Notes coming soon</p>
                <p className="text-zinc-600 text-sm">SOAP notes and progress narratives will appear here.</p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Target Detail Overlay */}
      <AnimatePresence>
        {selectedTarget && (
          <TargetDetailPanel
            target={selectedTarget}
            clientId={clientId}
            onClose={() => setSelectedTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ClientHubPage() {
  return (
    <Suspense fallback={
      <div className="p-8">
        <div className="glass-card skeleton h-32 w-full rounded-2xl" />
      </div>
    }>
      <ClientHubInner />
    </Suspense>
  );
}
