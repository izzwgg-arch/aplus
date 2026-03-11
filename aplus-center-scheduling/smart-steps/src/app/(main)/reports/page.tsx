"use client";

import { motion } from "framer-motion";

export default function ReportsPage() {
  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Reports</h1>
        <p className="text-zinc-500">Progress reports, SOAP notes, export PDF/CSV</p>
      </motion.div>
      <div className="glass-card mt-8 flex h-64 items-center justify-center rounded-2xl text-zinc-500">
        Reports & notes — coming soon
      </div>
    </div>
  );
}
