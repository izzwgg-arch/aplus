"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-10h8V3h-8z" },
  { href: "/clients", label: "Clients", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11A4 4 0 1 0 9 3a4 4 0 0 0 0 8m8 1a3 3 0 1 0 0-6m4 15v-2a4 4 0 0 0-3-3.87m-2-8.13a4 4 0 1 1 0-8" },
  { href: "/reports", label: "Reports", icon: "M9 17v-6M13 17V7M17 17v-3M4 19h16M6 19V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" },
  { href: "/settings", label: "Settings", icon: "M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2 border-b border-[var(--glass-border)] px-4">
          <Link href="/dashboard" className="font-semibold tracking-tight text-[var(--foreground)]">
            Smart Steps
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className="tap-target block">
                <motion.span
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                      : "text-zinc-400 hover:bg-white/5 hover:text-[var(--foreground)]"
                  }`}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <NavIcon d={item.icon} />
                  {item.label}
                </motion.span>
              </Link>
            );
          })}
        </nav>
        {session?.user && (
          <div className="border-t border-[var(--glass-border)] p-2">
            <div className="rounded-xl px-3 py-2 text-xs text-zinc-500">
              {(session.user as { role?: string }).role ?? "RBT"}
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="tap-target w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-[var(--foreground)]"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="min-h-screen flex-1 pl-56">
        {children}
      </main>
    </div>
  );
}
