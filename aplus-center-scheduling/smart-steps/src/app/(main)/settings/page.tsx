"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Moon, Sun, Monitor, Shield, Database, User } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { toast } from "sonner";

export default function SettingsPage() {
  const { theme, setTheme, resolved } = useThemeStore();
  const { data: session } = useSession();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const handleTheme = (t: "dark" | "light" | "system") => {
    setTheme(t);
    toast.success(`Theme set to ${t}`);
  };

  const user = session?.user as { name?: string | null; email?: string | null; role?: string } | undefined;

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        <p className="text-zinc-500 text-sm">Account, appearance, and system info</p>
      </motion.div>

      {/* Account */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <User className="h-5 w-5 text-[var(--accent-cyan)]" />
          <h2 className="font-semibold text-[var(--foreground)]">Account</h2>
        </div>
        {user ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
              <span className="text-sm text-zinc-400">Name</span>
              <span className="text-sm text-[var(--foreground)]">{user.name ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
              <span className="text-sm text-zinc-400">Email</span>
              <span className="text-sm text-[var(--foreground)]">{user.email ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-zinc-400">Role</span>
              <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${
                user.role === "ADMIN" ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                : user.role === "BCBA" ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                : "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]"
              }`}>
                {user.role ?? "RBT"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Not signed in</p>
        )}
      </motion.section>

      {/* Appearance */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="h-5 w-5 text-[var(--accent-purple)]" />
          <h2 className="font-semibold text-[var(--foreground)]">Appearance</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { value: "dark", Icon: Moon, label: "Dark" },
            { value: "light", Icon: Sun, label: "Light" },
            { value: "system", Icon: Monitor, label: "System" },
          ].map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTheme(value as "dark" | "light" | "system")}
              className={`tap-target flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all ${
                theme === value
                  ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] ring-1 ring-[var(--accent-cyan)]/50"
                  : "bg-[var(--glass-bg)] text-zinc-400 hover:text-[var(--foreground)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </motion.section>

      {/* Access control info */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-[var(--accent-pink)]" />
          <h2 className="font-semibold text-[var(--foreground)]">Access control</h2>
        </div>
        <div className="space-y-2 text-sm text-zinc-400">
          <p><span className="text-[var(--accent-pink)] font-medium">ADMIN:</span> Full access — create, edit, archive, delete anything</p>
          <p><span className="text-[var(--accent-cyan)] font-medium">BCBA:</span> Create and manage clients, goals, programs, assessments</p>
          <p><span className="text-[var(--accent-purple)] font-medium">RBT:</span> View assigned clients, record session data</p>
        </div>
      </motion.section>

      {/* System info */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-center gap-3 mb-4">
          <Database className="h-5 w-5 text-emerald-400" />
          <h2 className="font-semibold text-[var(--foreground)]">System</h2>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
            <span className="text-sm text-zinc-400">App</span>
            <span className="text-sm text-[var(--foreground)]">Smart Steps ABA Tracker</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
            <span className="text-sm text-zinc-400">Auth</span>
            <span className="text-sm text-emerald-400">NextAuth v5 / SSO</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
            <span className="text-sm text-zinc-400">Offline</span>
            <span className="text-sm text-[var(--accent-cyan)]">Dexie.js / IndexedDB</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-zinc-400">Data</span>
            <span className="text-sm text-[var(--foreground)]">PostgreSQL via Prisma</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-zinc-600">
          Assessment templates, clients, goals, and session data are stored in the connected PostgreSQL database.
          Offline session data is queued in IndexedDB and synced when you reconnect.
        </p>
      </motion.section>
    </div>
  );
}
