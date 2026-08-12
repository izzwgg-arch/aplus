"use client";

/**
 * Local data-recovery tool.
 *
 * Context: three historical bugs (now fixed — see dexie.ts / abaStore.ts)
 * could cause trials/behavior events entered offline to never reach the
 * server, with no error surfaced to the user at the time:
 *   1. An in-progress session got silently overwritten in memory/localStorage.
 *   2. The sync queue marked server-rejected items as "synced" anyway.
 *   3. A session that failed to create on the server was never queued to be
 *      created later, so trials referencing it could never sync.
 *
 * For (2) and (3), the RAW trial/behavior rows are never deleted from this
 * browser's local IndexedDB (`SmartStepsABA` → trials / behaviors tables) —
 * only a separate tracking flag was (incorrectly) set. This page must be
 * opened in the SAME BROWSER PROFILE that was used to originally enter the
 * data (site data must not have been cleared since) — it reads that local
 * database, figures out what never made it to the server, and lets you
 * push it there for real.
 *
 * This tool does not delete or modify anything locally by default — it only
 * reads, and only writes to the server when you explicitly click Recover.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, LifeBuoy, RefreshCw, Search } from "lucide-react";
import { getRecoverySnapshot, type OfflineTrial, type OfflineBehavior } from "@/lib/dexie";
import { useABAStore } from "@/store/abaStore";

const RECOVERED_LOG_KEY = "smart-steps-recovery-log";

type ClientLite = { id: string; name: string };

type RecoveryTrial = OfflineTrial & {
  resolvedTargetId: string | null;
  targetLabel: string;
  alreadyOnServer: boolean;
  recovered: boolean;
};

type RecoveryBehavior = OfflineBehavior & {
  alreadyOnServer: boolean;
  recovered: boolean;
};

interface RecoveryGroup {
  sessionKey: string;
  isLocalSession: boolean;
  resolvedSessionId: string | null;
  clientId: string | null;
  clientAutoResolved: boolean;
  trials: RecoveryTrial[];
  behaviors: RecoveryBehavior[];
  serverCheckError: string | null;
  recovering: boolean;
}

function loadRecoveredLog(): Set<string> {
  try {
    const raw = localStorage.getItem(RECOVERED_LOG_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveRecoveredLog(log: Set<string>) {
  try {
    localStorage.setItem(RECOVERED_LOG_KEY, JSON.stringify([...log]));
  } catch { /* ignore */ }
}

function closeEnough(aIso: string, bIso: string, windowMs = 5000) {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) <= windowMs;
}

export default function DataRecoveryPage() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [groups, setGroups] = useState<RecoveryGroup[]>([]);
  const [rawCounts, setRawCounts] = useState({ trials: 0, behaviors: 0 });

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const [{ trials, behaviors, syncQueue }, clientsRes] = await Promise.all([
        getRecoverySnapshot(),
        fetch("/smart-steps/api/clients").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      const clientList: ClientLite[] = (clientsRes ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
      setClients(clientList);
      setRawCounts({ trials: trials.length, behaviors: behaviors.length });

      const recoveredLog = loadRecoveredLog();
      const { targets } = useABAStore.getState();

      // Group everything by the session id it references.
      const bySession = new Map<string, { trials: OfflineTrial[]; behaviors: OfflineBehavior[] }>();
      for (const t of trials) {
        const g = bySession.get(t.sessionId) ?? { trials: [], behaviors: [] };
        g.trials.push(t);
        bySession.set(t.sessionId, g);
      }
      for (const b of behaviors) {
        const g = bySession.get(b.sessionId) ?? { trials: [], behaviors: [] };
        g.behaviors.push(b);
        bySession.set(b.sessionId, g);
      }

      const localSessionClientMap = new Map<string, string>();
      for (const item of syncQueue) {
        if (item.table === "sessions" && typeof item.payload.localId === "string" && typeof item.payload.clientId === "string") {
          localSessionClientMap.set(item.payload.localId, item.payload.clientId);
        }
      }

      const built: RecoveryGroup[] = [];
      for (const [sessionKey, items] of bySession) {
        const isLocalSession = sessionKey.startsWith("session-");

        let clientId: string | null = null;
        let clientAutoResolved = false;
        let serverCheckError: string | null = null;
        let existingServerTrials: { targetId: string; result: string; createdAt: string }[] = [];
        let existingServerBehaviors: { type: string; behavior: string | null; antecedent: string | null; consequence: string | null; createdAt: string }[] = [];

        if (isLocalSession) {
          clientId = localSessionClientMap.get(sessionKey) ?? null;
          if (!clientId) {
            // Fall back to whichever client the referenced targets belong to.
            for (const t of items.trials) {
              const match = targets.find((tg) => tg.id === t.targetId || tg.serverId === t.targetId);
              if (match) { clientId = match.clientId; break; }
            }
          }
          clientAutoResolved = !!clientId;
        } else {
          try {
            const res = await fetch(`/smart-steps/api/sessions/${sessionKey}`);
            if (res.ok) {
              const data = await res.json();
              clientId = data.clientId ?? null;
              clientAutoResolved = !!clientId;
              existingServerTrials = (data.trials ?? []).map((t: { targetId: string; result: string; createdAt: string }) => ({
                targetId: t.targetId, result: t.result, createdAt: t.createdAt,
              }));
              existingServerBehaviors = (data.behaviors ?? []).map((b: { type: string; behavior: string | null; antecedent: string | null; consequence: string | null; createdAt: string }) => ({
                type: b.type, behavior: b.behavior, antecedent: b.antecedent, consequence: b.consequence, createdAt: b.createdAt,
              }));
            } else {
              serverCheckError = `Server returned ${res.status} — could not verify what's already saved.`;
            }
          } catch {
            serverCheckError = "Could not reach the server to check what's already saved.";
          }
        }

        const recTrials: RecoveryTrial[] = items.trials.map((t) => {
          let resolvedTargetId: string | null = t.targetId;
          let targetLabel = t.targetId;
          if (t.targetId.startsWith("local-")) {
            const match = targets.find((tg) => tg.id === t.targetId);
            resolvedTargetId = match?.serverId ?? null;
            targetLabel = match?.title ?? `unresolved local target (${t.targetId})`;
          } else {
            const match = targets.find((tg) => tg.serverId === t.targetId || tg.id === t.targetId);
            if (match) targetLabel = match.title;
          }
          const alreadyOnServer = existingServerTrials.some(
            (st) => st.targetId === resolvedTargetId && st.result === t.result && closeEnough(st.createdAt, t.createdAt)
          );
          return {
            ...t,
            resolvedTargetId,
            targetLabel,
            alreadyOnServer,
            recovered: recoveredLog.has(`trial:${t.id}`),
          };
        });

        const recBehaviors: RecoveryBehavior[] = items.behaviors.map((b) => {
          const alreadyOnServer = existingServerBehaviors.some(
            (sb) => sb.type === b.type && (sb.behavior ?? "") === (b.behavior ?? "") && (sb.antecedent ?? "") === (b.antecedent ?? "") && closeEnough(sb.createdAt, b.createdAt)
          );
          return { ...b, alreadyOnServer, recovered: recoveredLog.has(`behavior:${b.id}`) };
        });

        built.push({
          sessionKey,
          isLocalSession,
          resolvedSessionId: isLocalSession ? null : sessionKey,
          clientId,
          clientAutoResolved,
          trials: recTrials,
          behaviors: recBehaviors,
          serverCheckError,
          recovering: false,
        });
      }

      // Only surface groups that actually have something worth looking at.
      built.sort((a, b) => {
        const aEarliest = Math.min(...[...a.trials, ...a.behaviors].map((i) => new Date(i.createdAt).getTime()));
        const bEarliest = Math.min(...[...b.trials, ...b.behaviors].map((i) => new Date(i.createdAt).getTime()));
        return bEarliest - aEarliest;
      });
      setGroups(built);
    } catch (e) {
      toast.error("Failed to scan local data: " + String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  const setGroupClientId = (sessionKey: string, clientId: string) => {
    setGroups((prev) => prev.map((g) => (g.sessionKey === sessionKey ? { ...g, clientId, clientAutoResolved: false } : g)));
  };

  const recoverGroup = useCallback(async (sessionKey: string) => {
    setGroups((prev) => prev.map((g) => (g.sessionKey === sessionKey ? { ...g, recovering: true } : g)));
    const group = groups.find((g) => g.sessionKey === sessionKey);
    if (!group) return;

    const trialsToRecover = group.trials.filter((t) => !t.alreadyOnServer && !t.recovered && t.resolvedTargetId);
    const behaviorsToRecover = group.behaviors.filter((b) => !b.alreadyOnServer && !b.recovered);

    if (!group.clientId) {
      toast.error("Select a client for this session before recovering.");
      setGroups((prev) => prev.map((g) => (g.sessionKey === sessionKey ? { ...g, recovering: false } : g)));
      return;
    }
    if (trialsToRecover.length === 0 && behaviorsToRecover.length === 0) {
      toast.info("Nothing left to recover in this session.");
      setGroups((prev) => prev.map((g) => (g.sessionKey === sessionKey ? { ...g, recovering: false } : g)));
      return;
    }

    try {
      let sid = group.resolvedSessionId;
      if (!sid) {
        const allTimes = [...trialsToRecover, ...behaviorsToRecover].map((i) => new Date(i.createdAt).getTime());
        const startedAt = new Date(Math.min(...allTimes)).toISOString();
        const endedAt = new Date(Math.max(...allTimes)).toISOString();
        const res = await fetch("/smart-steps/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: group.clientId, startedAt, endedAt }),
        });
        if (!res.ok) throw new Error(`Could not create session (${res.status})`);
        const data = await res.json();
        sid = data.id;
      }

      if (trialsToRecover.length > 0) {
        const res = await fetch("/smart-steps/api/trials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            trials: trialsToRecover.map((t) => ({
              targetId: t.resolvedTargetId, result: t.result, promptLevel: t.promptLevel,
              latencyMs: t.latencyMs, createdAt: t.createdAt,
            })),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Failed to save trials (${res.status})`);
        }
      }

      if (behaviorsToRecover.length > 0) {
        const res = await fetch("/smart-steps/api/behaviors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            events: behaviorsToRecover.map((b) => ({
              type: b.type, antecedent: b.antecedent, behavior: b.behavior,
              consequence: b.consequence, intensity: b.intensity, value: b.value,
            })),
          }),
        });
        if (!res.ok) throw new Error(`Failed to save behavior events (${res.status})`);
      }

      const log = loadRecoveredLog();
      trialsToRecover.forEach((t) => log.add(`trial:${t.id}`));
      behaviorsToRecover.forEach((b) => log.add(`behavior:${b.id}`));
      saveRecoveredLog(log);

      toast.success(`Recovered ${trialsToRecover.length} trial(s) and ${behaviorsToRecover.length} behavior event(s).`);
      setGroups((prev) => prev.map((g) => {
        if (g.sessionKey !== sessionKey) return g;
        return {
          ...g,
          resolvedSessionId: sid,
          recovering: false,
          trials: g.trials.map((t) => (log.has(`trial:${t.id}`) ? { ...t, recovered: true } : t)),
          behaviors: g.behaviors.map((b) => (log.has(`behavior:${b.id}`) ? { ...b, recovered: true } : b)),
        };
      }));
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
      setGroups((prev) => prev.map((g) => (g.sessionKey === sessionKey ? { ...g, recovering: false } : g)));
    }
  }, [groups]);

  const downloadRawExport = useCallback(async () => {
    const snapshot = await getRecoverySnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-steps-local-data-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const activeSession = useABAStore((s) => s.activeSession);

  const totalOutstanding = useMemo(
    () => groups.reduce((sum, g) =>
      sum
      + g.trials.filter((t) => !t.alreadyOnServer && !t.recovered).length
      + g.behaviors.filter((b) => !b.alreadyOnServer && !b.recovered).length,
    0),
    [groups]
  );

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2.5">
          <LifeBuoy className="h-6 w-6 text-[var(--accent-cyan)]" />
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Local Data Recovery</h1>
        </div>
        <p className="text-zinc-500 text-sm mt-1 max-w-2xl">
          Scans THIS browser&apos;s local offline storage for trials/behavior events that were
          recorded here but never made it to the server, and lets you push them up for real.
          This must be run on the same device/browser where the data was originally entered —
          it cannot recover data from a different device.
        </p>
      </motion.div>

      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => void scan()}
          disabled={loading}
          className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Scanning…" : "Re-scan local storage"}
        </button>
        <button
          type="button"
          onClick={downloadRawExport}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-4 py-2 text-sm text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
        >
          <Download className="h-4 w-4" />
          Download raw backup (JSON)
        </button>
        <span className="text-xs text-zinc-500">
          {rawCounts.trials} raw trial record(s), {rawCounts.behaviors} raw behavior record(s) found in this browser
        </span>
      </div>

      {activeSession && !activeSession.saved && (
        <div className="glass-card rounded-2xl p-4 mb-4 border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            You currently have an unsaved in-progress session ({activeSession.trials.length} trial(s)) still sitting
            safely in this browser — it is NOT lost, go finish/save it from the client&apos;s Data Entry tab rather than
            trying to recover it here.
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Search className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">No local session data found in this browser.</p>
          <p className="text-zinc-600 text-sm mt-1">
            Either nothing was lost here, it already synced successfully, or this isn&apos;t the original device.
          </p>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div className="mb-4 text-sm text-zinc-400">
          {totalOutstanding > 0
            ? <span className="text-amber-400 font-medium">{totalOutstanding} item(s) found that never reached the server.</span>
            : <span className="text-emerald-400 font-medium">Everything found locally already matches what&apos;s on the server.</span>}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g) => {
          const outstandingTrials = g.trials.filter((t) => !t.alreadyOnServer && !t.recovered);
          const unresolvedTrials = outstandingTrials.filter((t) => !t.resolvedTargetId);
          const recoverableTrials = outstandingTrials.filter((t) => t.resolvedTargetId);
          const outstandingBehaviors = g.behaviors.filter((b) => !b.alreadyOnServer && !b.recovered);
          const nothingOutstanding = recoverableTrials.length === 0 && outstandingBehaviors.length === 0;
          const client = clients.find((c) => c.id === g.clientId);

          return (
            <motion.div key={g.sessionKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {client ? client.name : g.clientId ? "Unknown client" : "Client not identified"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {g.isLocalSession ? "Session was never created on the server" : `Session ${g.sessionKey}`}
                    {" · "}{g.trials.length} trial(s), {g.behaviors.length} behavior event(s) found locally
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {nothingOutstanding ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Nothing to recover
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void recoverGroup(g.sessionKey)}
                      disabled={g.recovering || !g.clientId}
                      className="btn-primary tap-target rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      {g.recovering ? "Recovering…" : `Recover ${recoverableTrials.length + outstandingBehaviors.length} item(s)`}
                    </button>
                  )}
                </div>
              </div>

              {!g.clientId && (
                <div className="mb-3">
                  <label className="mb-1 block text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
                    Which client was this session for? (couldn&apos;t auto-detect)
                  </label>
                  <select
                    className="field-input w-full max-w-sm text-sm"
                    defaultValue=""
                    onChange={(e) => setGroupClientId(g.sessionKey, e.target.value)}
                  >
                    <option value="" disabled>Select a client…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {g.serverCheckError && (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> {g.serverCheckError}
                </p>
              )}

              {unresolvedTrials.length > 0 && (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-[var(--accent-pink)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {unresolvedTrials.length} trial(s) reference a goal/target that can&apos;t be automatically matched —
                  these need to be re-entered manually (details below).
                </p>
              )}

              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer select-none text-zinc-500 hover:text-zinc-300">
                  Show {g.trials.length + g.behaviors.length} raw record(s)
                </summary>
                <div className="mt-2 space-y-1 max-h-64 overflow-y-auto pr-2">
                  {g.trials.map((t) => (
                    <div key={`trial-${t.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                      <span className="truncate">
                        <span className="text-zinc-500">{new Date(t.createdAt).toLocaleString()}</span>{" — "}
                        {t.targetLabel} → <span className="font-medium">{t.result}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        t.recovered ? "bg-emerald-500/20 text-emerald-400"
                        : t.alreadyOnServer ? "bg-zinc-500/20 text-zinc-400"
                        : t.resolvedTargetId ? "bg-amber-500/20 text-amber-400"
                        : "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                      }`}>
                        {t.recovered ? "recovered" : t.alreadyOnServer ? "already saved" : t.resolvedTargetId ? "needs recovery" : "needs manual entry"}
                      </span>
                    </div>
                  ))}
                  {g.behaviors.map((b) => (
                    <div key={`behavior-${b.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                      <span className="truncate">
                        <span className="text-zinc-500">{new Date(b.createdAt).toLocaleString()}</span>{" — "}
                        {b.type}{b.behavior ? `: ${b.behavior}` : ""}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        b.recovered ? "bg-emerald-500/20 text-emerald-400" : b.alreadyOnServer ? "bg-zinc-500/20 text-zinc-400" : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {b.recovered ? "recovered" : b.alreadyOnServer ? "already saved" : "needs recovery"}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
