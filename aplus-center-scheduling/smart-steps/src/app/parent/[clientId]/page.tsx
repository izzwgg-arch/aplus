"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, Activity, Calendar, Lock, ShieldAlert } from "lucide-react";

type ClientDetail = {
  id: string;
  name: string;
  age: number | null;
  diagnosis: string[];
  progressData: { date: string; pct: number }[];
  masteredTargets: number;
  totalTargets: number;
  recentSessions: { date: string; duration: number | null; trialCount: number }[];
};

const tooltipStyle = {
  backgroundColor: "rgba(15,15,20,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  color: "#e4e4e7",
};

function ParentPortalInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const clientId = String(params.clientId ?? "");
  const token = searchParams.get("token") ?? "";

  const { data: client, isLoading, error } = useQuery<ClientDetail>({
    queryKey: ["parent-client", clientId, token],
    queryFn: async () => {
      if (!token) throw new Error("No token");
      const res = await fetch(`/smart-steps/api/parent/${clientId}?token=${token}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Access denied");
      }
      return res.json();
    },
    enabled: !!clientId && !!token,
    retry: false,
  });

  // No token or invalid token
  if (!token || error) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--background)] p-6">
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-[var(--accent-pink)] mx-auto" />
          <h1 className="text-xl font-bold text-[var(--foreground)]">Access restricted</h1>
          <p className="text-zinc-500 text-sm">
            This parent portal requires a secure link provided by your therapist.
            Please contact your BCBA to receive your personalized access link.
          </p>
          {error && <p className="text-xs text-[var(--accent-pink)]">{(error as Error).message}</p>}
        </div>
      </div>
    );
  }

  const data = client;

  return (
    <div className="min-h-dvh bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--glass-border)] bg-[var(--background)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="font-bold text-[var(--foreground)]">Smart Steps ABA</h1>
            <p className="text-xs text-zinc-500">Parent &amp; Caregiver Portal</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--glass-bg)] px-3 py-1.5 text-xs text-zinc-400">
            <Lock className="h-3 w-3" />
            Read-only
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-32 rounded-2xl" />)}
          </div>
        ) : data ? (
          <>
            {/* Learner card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl p-6"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-cyan)]/20 to-[var(--accent-purple)]/20 text-2xl font-bold text-[var(--accent-cyan)]">
                  {data.name.slice(0, 1)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[var(--foreground)]">{data.name}</h2>
                  {data.age !== null && <p className="text-sm text-zinc-500">Age {data.age}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {data.diagnosis.map((d) => (
                      <span key={d} className="rounded-full bg-[var(--accent-purple)]/20 px-2 py-0.5 text-xs text-[var(--accent-purple)]">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Quick stats */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {[
                { icon: TrendingUp, label: "Skills mastered", value: `${data.masteredTargets}/${data.totalTargets}`, color: "var(--accent-purple)" },
                { icon: Calendar, label: "Recent sessions", value: `${data.recentSessions.length}`, color: "#34d399" },
                {
                  icon: Activity,
                  label: "Total trials",
                  value: data.recentSessions.reduce((sum, s) => sum + s.trialCount, 0).toString(),
                  color: "var(--accent-cyan)"
                },
              ].map((s) => (
                <div key={s.label} className="glass-card rounded-2xl p-4">
                  <s.icon className="mb-2 h-5 w-5" style={{ color: s.color }} />
                  <div className="text-lg font-bold text-[var(--foreground)]">{s.value}</div>
                  <div className="text-xs text-zinc-500">{s.label}</div>
                </div>
              ))}
            </motion.div>

            {/* Progress chart */}
            {data.progressData.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card rounded-2xl p-6"
              >
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[var(--accent-cyan)]" />
                  <h3 className="font-semibold text-[var(--foreground)]">Skill progress over time</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "% Correct"]} />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      stroke="url(#progressGrad)"
                      strokeWidth={2.5}
                      dot={{ fill: "#22d3ee", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <defs>
                      <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Recent sessions */}
            {data.recentSessions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card rounded-2xl p-6"
              >
                <h3 className="mb-4 font-semibold text-[var(--foreground)]">Recent sessions</h3>
                <div className="space-y-3">
                  {data.recentSessions.map((s, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 border-b border-[var(--glass-border)] pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">{s.date}</p>
                        <p className="text-xs text-zinc-500">{s.trialCount} trial{s.trialCount !== 1 ? "s" : ""} recorded</p>
                      </div>
                      {s.duration !== null && (
                        <span className="shrink-0 rounded-full bg-[var(--glass-bg)] px-2.5 py-1 text-xs text-zinc-400">
                          {s.duration} min
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {data.progressData.length === 0 && data.recentSessions.length === 0 && (
              <div className="glass-card rounded-2xl p-8 text-center">
                <p className="text-zinc-500">No session data recorded yet. Check back after your next ABA session.</p>
              </div>
            )}

            <p className="pb-8 text-center text-xs text-zinc-600">
              This portal displays a summary of your child&apos;s ABA progress. For detailed clinical data or to discuss
              the treatment plan, please contact your BCBA directly.
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default function ParentPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-[var(--background)] flex items-center justify-center">
        <div className="glass-card skeleton h-48 w-80 rounded-2xl" />
      </div>
    }>
      <ParentPortalInner />
    </Suspense>
  );
}
