"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, FileBarChart, Settings, Wifi, WifiOff,
  RefreshCw, ClipboardList, Target, ChevronDown, Plus, Zap, Menu, X,
  ArrowLeft,
} from "lucide-react";

const APLUS_CENTER_URL = "https://app.apluscenterinc.org/aplus";
import { getPendingCount, flushSyncQueue } from "@/lib/dexie";
import { toast } from "sonner";

/* ─── Nav config ─────────────────────────────────────────────────────────── */

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/goals-and-targets", label: "Goals & Targets", icon: Target },
  { href: "/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

/* ─── Sidebar inner content (shared by desktop & mobile drawer) ──────────── */

function SidebarContent({
  onClose,
  goalsOpen,
  setGoalsOpen,
  isGoalsActive,
  isOnline,
  pendingCount,
  syncing,
  handleSync,
}: {
  onClose?: () => void;
  goalsOpen: boolean;
  setGoalsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGoalsActive: boolean;
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  handleSync: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  return (
    <>
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2.5 border-b border-[var(--glass-border)] px-4">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-purple)]">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <Link
              href="/dashboard"
              onClick={onClose}
              className="font-bold tracking-tight text-[var(--foreground)] hover:text-[var(--accent-cyan)] transition-colors"
            >
              Smart Steps
            </Link>
          </div>
          <a
            href={APLUS_CENTER_URL}
            onClick={onClose}
            className="ml-9 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors leading-none mt-0.5"
          >
            <ArrowLeft className="h-2.5 w-2.5" />
            A+ Center
          </a>
        </div>
        {/* Mobile close button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav items — scrollable if many */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-none">
        {NAV.map((item) => {
          const isGoals = item.href === "/goals-and-targets";
          const active = isGoals
            ? isGoalsActive
            : pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;

          if (isGoals) {
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => {
                    setGoalsOpen((v) => !v);
                    router.push("/goals-and-targets");
                    onClose?.();
                  }}
                  className="w-full"
                >
                  <motion.span
                    className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]"
                        : "text-zinc-400 hover:bg-white/5 hover:text-[var(--foreground)]"
                    }`}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <motion.div animate={{ rotate: goalsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </motion.div>
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {goalsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[var(--glass-border)] pl-3">
                        <Link
                          href="/goals-and-targets?action=new-category"
                          onClick={onClose}
                          className="flex min-h-[40px] items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-400 hover:bg-[var(--accent-cyan)]/10 hover:text-[var(--accent-cyan)] transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" />
                          + Category
                        </Link>
                        <Link
                          href="/goals-and-targets?action=new-goal"
                          onClick={onClose}
                          className="flex min-h-[40px] items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-400 hover:bg-[var(--accent-purple)]/10 hover:text-[var(--accent-purple)] transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" />
                          + New Goals and Targets
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href} onClick={onClose} className="block">
              <motion.span
                className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]"
                    : "text-zinc-400 hover:bg-white/5 hover:text-[var(--foreground)]"
                }`}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </motion.span>
            </Link>
          );
        })}

      </nav>

      {/* Status bar */}
      <div className="shrink-0 px-3 py-2 border-t border-[var(--glass-border)]/50">
        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
            isOnline ? "text-emerald-400" : "text-[var(--accent-pink)]"
          }`}
        >
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5 animate-pulse" />}
          {isOnline ? "Online" : "Offline — saved locally"}
        </div>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !isOnline}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-amber-400 hover:bg-amber-400/10 disabled:opacity-50 transition-colors min-h-[40px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : `${pendingCount} pending sync`}
          </button>
        )}
      </div>

      {/* User */}
      {session?.user && (
        <div className="shrink-0 border-t border-[var(--glass-border)] p-2">
          <div className="rounded-xl px-3 py-2">
            <p className="text-xs font-medium text-zinc-300 truncate">
              {session.user.name ?? session.user.email}
            </p>
            <p className="text-xs text-zinc-500 capitalize">
              {(session.user as { role?: string }).role?.toLowerCase() ?? "rbt"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full min-h-[40px] items-center rounded-xl px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-[var(--foreground)] transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Main layout ────────────────────────────────────────────────────────── */

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-expand goals section on related pages
  useEffect(() => {
    if (pathname.includes("/goals") || pathname.includes("/goals-and-targets")) {
      setGoalsOpen(true);
    }
    // Close mobile drawer on route change
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    getPendingCount().then(setPendingCount).catch(() => {});
    const id = setInterval(() => getPendingCount().then(setPendingCount).catch(() => {}), 15_000);
    return () => clearInterval(id);
  }, []);

  async function handleSync() {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const result = await flushSyncQueue();
      if (result.synced > 0) toast.success(`Synced ${result.synced} items.`);
      if (result.conflicts > 0) toast.warning(`${result.conflicts} conflict(s) — server wins.`);
      if (result.errors > 0) toast.error(`${result.errors} item(s) failed to sync.`);
      setPendingCount(0);
    } catch {
      toast.error("Sync failed. Will retry.");
    } finally {
      setSyncing(false);
    }
  }

  const isGoalsActive =
    pathname.includes("/goals") || pathname === "/goals-and-targets";

  const sharedProps = {
    goalsOpen,
    setGoalsOpen,
    isGoalsActive,
    isOnline,
    pendingCount,
    syncing,
    handleSync,
  };

  return (
    /*
     * KEY FIX:
     * h-screen + overflow-hidden on the root shell means the HTML body NEVER
     * scrolls. Only <main> (the right panel) scrolls via overflow-y-auto.
     * This makes position:fixed on the sidebar bullet-proof in all browsers,
     * including iOS Safari and pages that use Framer Motion route transforms.
     */
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">

      {/* ── DESKTOP SIDEBAR ───────────────────────────────────────────────── */}
      {/*
       * `fixed inset-y-0 left-0` pins it to the viewport LEFT edge.
       * `hidden md:flex` hides it on mobile (mobile uses the drawer below).
       * `w-60` = 240px — matches the ml-60 offset on <main>.
       */}
      <aside
        className="
          fixed inset-y-0 left-0 z-30
          hidden md:flex w-60 flex-col
          border-r border-[var(--glass-border)]
          bg-[var(--glass-bg)] backdrop-blur-xl
        "
      >
        <SidebarContent {...sharedProps} />
      </aside>

      {/* ── MOBILE DRAWER + BACKDROP ──────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer panel */}
            <motion.aside
              key="drawer"
              className="
                fixed inset-y-0 left-0 z-50
                flex w-72 flex-col
                border-r border-[var(--glass-border)]
                bg-[var(--background)]
                shadow-2xl
                md:hidden
              "
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
            >
              <SidebarContent {...sharedProps} onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      {/*
       * flex-1           → fills all remaining horizontal space
       * md:ml-60         → offset by sidebar width on desktop
       * overflow-y-auto  → THIS element scrolls, not the document body
       * min-h-0          → crucial: overrides flex min-height:auto so the
       *                    container actually shrinks and overflow-y-auto works
       */}
      <main className="flex flex-col flex-1 md:ml-60 overflow-y-auto min-h-0">

        {/* Mobile top bar — hamburger + brand (desktop: hidden) */}
        <header className="
          sticky top-0 z-20
          flex h-14 shrink-0 items-center gap-3
          border-b border-[var(--glass-border)]
          bg-[var(--background)]/90 backdrop-blur-md
          px-4
          md:hidden
        ">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setMobileOpen(true)}
            className="rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </motion.button>

          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-purple)]">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <Link href="/dashboard" className="font-bold text-[var(--foreground)]">
            Smart Steps
          </Link>

          <div className="ml-auto">
            <a
              href={APLUS_CENTER_URL}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              A+ Center
            </a>
          </div>
        </header>

        {/* Page content */}
        {children}
      </main>
    </div>
  );
}
