"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Calendar, Clock, Eye, FileCheck2, FilePlus2, Filter, Target as TargetIcon,
  Trash2, User, X, Zap, StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { formatSessionHours } from "@/lib/formatDuration";

/* ── Types ───────────────────────────────────────────────────────────────── */

export type SessionListItem = {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
  mode: string;
  trialCount: number;
  pctCorrect?: number | null;
  providerId?: string | null;
  therapistName?: string | null;
  therapistRole?: string | null;
  /** The session's own free-text field notes (not a written-up session note). */
  hasNotes?: boolean;
  /** Number of session notes written for this session (generated or typed). */
  noteCount?: number;
  noteGeneratedAt?: string | null;
  /** True when the most recent note came from "Generate BT Note". */
  noteIsGenerated?: boolean | null;
  /** Goals attached to the session by hand, without trial data. */
  addedGoalCount?: number;
  /** A BCBA supervised this session — only these can be written up as a
   *  direct-supervision (DSU) note. */
  supervised?: boolean;
  supervisorName?: string | null;
};

type ProviderOption = { id: string; name: string | null; role: string; displayRole?: string | null };

type Filters = {
  from: string;
  to: string;
  providerId: string;
  mode: string;
  withData: boolean;
  /** "" = any, "1" = note written, "0" = still needs a note. */
  hasNote: string;
  /** "" = any, "1" = supervised, "0" = not supervised. */
  supervised: string;
};

const EMPTY_FILTERS: Filters = { from: "", to: "", providerId: "", mode: "", withData: false, hasNote: "", supervised: "" };

const MODE_LABELS: Record<string, string> = {
  DTT: "DTT",
  INTERVAL: "Interval",
  ABC: "ABC",
  MAINTENANCE: "Maintenance",
};

const SESSIONS_PAGE_SIZE = 50;

/* ── Formatting helpers ──────────────────────────────────────────────────── */

function formatServiceDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "9:00 AM – 11:30 AM · 2.5 hrs", or just the start time when still open. */
function formatTimeRange(startedAt: string, endedAt?: string | null): string {
  const start = formatTime(startedAt);
  if (!endedAt) return `${start} – in progress`;
  const hours = formatSessionHours(startedAt, endedAt);
  return `${start} – ${formatTime(endedAt)}${hours ? ` · ${hours}` : ""}`;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export function SessionsTab({
  clientId,
  onOpenSession,
  onStartSession,
}: {
  clientId: string;
  onOpenSession: (sessionId: string) => void;
  onStartSession: () => void;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDelete = can("smartsteps.sessions.delete");

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtersActive =
    Boolean(filters.from || filters.to || filters.providerId || filters.mode || filters.withData || filters.hasNote || filters.supervised);

  /* Provider list for the filter dropdown (active staff, any role). */
  const { data: providers = [] } = useQuery<ProviderOption[]>({
    queryKey: ["providers-dropdown"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/users?forDropdown=1");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  /**
   * Sessions are paginated, so every filter is applied SERVER-side — filtering
   * only the pages already loaded would hide matching sessions that live further
   * back in the history.
   */
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["sessions", clientId, filters.from, filters.to, filters.providerId, filters.mode, filters.withData, filters.hasNote, filters.supervised],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        clientId,
        limit: String(SESSIONS_PAGE_SIZE),
        offset: String(pageParam),
      });
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.providerId) params.set("providerId", filters.providerId);
      if (filters.mode) params.set("mode", filters.mode);
      if (filters.withData) params.set("withData", "1");
      if (filters.hasNote) params.set("hasNote", filters.hasNote);
      if (filters.supervised) params.set("supervised", filters.supervised);
      const res = await fetch(`/smart-steps/api/sessions?${params}`);
      if (!res.ok) return [] as SessionListItem[];
      return (await res.json()) as SessionListItem[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === SESSIONS_PAGE_SIZE ? allPages.length * SESSIONS_PAGE_SIZE : undefined,
    enabled: !!clientId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const sessions = useMemo(() => data?.pages.flat() ?? [], [data]);

  async function handleDelete(session: SessionListItem) {
    const label = `${formatServiceDate(session.startedAt)} at ${formatTime(session.startedAt)}`;
    const ok = window.confirm(
      `Delete the session on ${label}?\n\n` +
      `${session.trialCount} trial${session.trialCount !== 1 ? "s" : ""} recorded in it will be removed from graphs and reports. ` +
      `The record is kept in the database and can be restored by an administrator.`
    );
    if (!ok) return;

    setDeletingId(session.id);
    try {
      const res = await fetch(`/smart-steps/api/sessions/${session.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to delete session");
      }
      toast.success("Session deleted");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-zinc-500">
          {sessions.length}{hasNextPage ? "+" : ""} session{sessions.length !== 1 ? "s" : ""}
          {filtersActive && " matching filters"}
        </p>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`tap-target inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${
            showFilters || filtersActive
              ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
              : "border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters{filtersActive ? " · on" : ""}
        </button>

        <button
          type="button"
          onClick={onStartSession}
          className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
        >
          <Zap className="h-4 w-4" /> New Session
        </button>
      </div>

      {/* ── Filter panel ── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="glass-card grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">From date</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                  className="field-input w-full text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">To date</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                  className="field-input w-full text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Provider</label>
                <select
                  value={filters.providerId}
                  onChange={(e) => setFilters((f) => ({ ...f, providerId: e.target.value }))}
                  className="field-input w-full text-sm"
                >
                  <option value="">All providers</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || "(no name)"}{p.displayRole ? ` · ${p.displayRole}` : p.role ? ` · ${p.role}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Session type</label>
                <select
                  value={filters.mode}
                  onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value }))}
                  className="field-input w-full text-sm"
                >
                  <option value="">All types</option>
                  {Object.entries(MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Session note</label>
                <select
                  value={filters.hasNote}
                  onChange={(e) => setFilters((f) => ({ ...f, hasNote: e.target.value }))}
                  className="field-input w-full text-sm"
                >
                  <option value="">Any</option>
                  <option value="1">Note written</option>
                  <option value="0">Needs a note</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Supervision</label>
                <select
                  value={filters.supervised}
                  onChange={(e) => setFilters((f) => ({ ...f, supervised: e.target.value }))}
                  className="field-input w-full text-sm"
                >
                  <option value="">Any</option>
                  <option value="1">Supervised</option>
                  <option value="0">Not supervised</option>
                </select>
              </div>

              <label className="col-span-full flex w-fit cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={filters.withData}
                  onChange={(e) => setFilters((f) => ({ ...f, withData: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[var(--accent-cyan)]"
                />
                Only sessions with trial data (hide empty sessions)
              </label>

              {filtersActive && (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="col-span-full flex w-fit items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-24 rounded-2xl" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-12 text-center">
          <Activity className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
          <p className="mb-1 font-medium text-zinc-400">
            {filtersActive ? "No sessions match the current filters" : "No sessions recorded yet"}
          </p>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-5 py-2.5 text-sm text-zinc-400 hover:text-zinc-200"
            >
              <X className="h-4 w-4" /> Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartSession}
              className="btn-primary mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              <Zap className="h-4 w-4" /> Start first session
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="glass-card flex items-center gap-4 rounded-2xl p-4 transition-colors hover:border-[var(--accent-cyan)]/40"
            >
              <button
                type="button"
                onClick={() => onOpenSession(s.id)}
                className="flex flex-1 items-center gap-4 text-left min-w-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10">
                  <Activity className="h-5 w-5 text-[var(--accent-cyan)]" />
                </div>

                <div className="min-w-0 flex-1">
                  {/* Date + session type — visible without opening the session */}
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)]">
                      <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                      {formatServiceDate(s.startedAt)}
                    </p>
                    <span className="rounded-full bg-[var(--glass-bg)] px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
                      {MODE_LABELS[s.mode] ?? s.mode}
                    </span>
                    {/* Whether the session has been written up — visible without
                        opening the session, so it is obvious what still needs a note. */}
                    {(s.noteCount ?? 0) > 0 ? (
                      <span
                        title={
                          s.noteGeneratedAt
                            ? `Note ${s.noteIsGenerated ? "generated" : "written"} ${formatServiceDate(s.noteGeneratedAt)}`
                            : undefined
                        }
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400"
                      >
                        <FileCheck2 className="h-3 w-3" />
                        {s.noteIsGenerated === false ? "Note written" : "Note generated"}
                        {(s.noteCount ?? 0) > 1 ? ` ×${s.noteCount}` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                        <FilePlus2 className="h-3 w-3" /> No note yet
                      </span>
                    )}
                    {s.supervised && (
                      <span
                        title={s.supervisorName ? `Supervised by ${s.supervisorName}` : "A BCBA supervised this session"}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-purple)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-purple)]"
                      >
                        <Eye className="h-3 w-3" /> Supervised
                      </span>
                    )}
                    {(s.addedGoalCount ?? 0) > 0 && (
                      <span
                        title="Goals added to this session without trial data"
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500"
                      >
                        <TargetIcon className="h-3 w-3" /> +{s.addedGoalCount} goal{s.addedGoalCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {s.hasNotes && (
                      <span title="Field notes were typed on this session" className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                        <StickyNote className="h-3 w-3" /> field notes
                      </span>
                    )}
                  </div>

                  {/* Time in – time out + duration */}
                  <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="h-3 w-3 text-zinc-500" />
                    {formatTimeRange(s.startedAt, s.endedAt)}
                  </p>

                  {/* Provider + trial count */}
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                    <User className="h-3 w-3" />
                    {s.therapistName ?? "Unassigned provider"}
                    {s.therapistRole && ` (${s.therapistRole})`}
                    {" · "}
                    {s.trialCount} trial{s.trialCount !== 1 ? "s" : ""}
                  </p>
                </div>

                {s.pctCorrect != null && (
                  <span
                    className={`shrink-0 text-sm font-bold ${
                      s.pctCorrect >= 80 ? "text-emerald-400"
                        : s.pctCorrect >= 60 ? "text-amber-400"
                        : "text-[var(--accent-pink)]"
                    }`}
                  >
                    {Math.round(s.pctCorrect)}%
                  </span>
                )}
              </button>

              {canDelete && (
                <button
                  type="button"
                  onClick={() => void handleDelete(s)}
                  disabled={deletingId === s.id}
                  aria-label="Delete session"
                  title="Delete session"
                  className="shrink-0 rounded-lg p-2 text-zinc-600 transition-colors hover:bg-[var(--accent-pink)]/10 hover:text-[var(--accent-pink)] disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--glass-border)] py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:border-[var(--accent-cyan)]/40 hover:text-zinc-200 disabled:opacity-60"
            >
              {isFetchingNextPage ? "Loading…" : "Load older sessions"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
