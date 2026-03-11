"use client";

import { motion } from "framer-motion";

export default function SettingsPage() {
  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        <p className="text-zinc-500">Theme, notifications, account</p>
      </motion.div>
      <div className="glass-card mt-8 flex h-64 items-center justify-center rounded-2xl text-zinc-500">
        Dark/light/auto toggle & settings — coming soon
      </div>
    </div>
  );
}
