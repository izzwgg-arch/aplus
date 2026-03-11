"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { motion } from "framer-motion";

const APLUS_TOKEN_EMAIL = "__aplus_token__";

export default function SplashPage() {
  const router = useRouter();
  const { status } = useSession();
  const [stats, setStats] = useState({ sessionsToday: 0, masteryStreak: 0 });
  const [tokenLoginDone, setTokenLoginDone] = useState(false);

  useEffect(() => {
    setStats({ sessionsToday: 4, masteryStreak: 87 });
  }, []);

  // A+ Center SSO: if URL has #token=..., sign in with that token (no separate password)
  useEffect(() => {
    if (typeof window === "undefined" || tokenLoginDone) return;
    const hash = window.location.hash?.replace(/^#/, "") || "";
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    if (token) {
      setTokenLoginDone(true);
      signIn("credentials", { email: APLUS_TOKEN_EMAIL, password: token, redirect: false }).then((res) => {
        if (res?.ok) router.replace("/dashboard");
        else router.replace("/login");
      });
      return;
    }
  }, [router, tokenLoginDone]);

  useEffect(() => {
    if (tokenLoginDone) return;
    const t = setTimeout(() => {
      if (status === "authenticated") router.replace("/dashboard");
      else if (status === "unauthenticated") router.replace("/login");
      else router.replace("/dashboard");
    }, 2200);
    return () => clearTimeout(t);
  }, [router, status, tokenLoginDone]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="glass-card flex flex-col items-center gap-6 p-10 text-center"
      >
        <div className="text-4xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-purple)] to-[var(--accent-pink)] bg-clip-text text-transparent">
            Smart Steps
          </span>
          <br />
          <span className="text-[var(--foreground)]">ABA Tracker</span>
        </div>
        <p className="text-sm text-zinc-400">Data doesn&apos;t sleep.</p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex gap-6 text-sm"
        >
          <span className="text-[var(--accent-cyan)]">Sessions today: {stats.sessionsToday}</span>
          <span className="text-[var(--accent-pink)]">Mastery streak: 🔥 {stats.masteryStreak}%</span>
        </motion.div>
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="h-1 w-24 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500"
        />
      </motion.div>
    </div>
  );
}
