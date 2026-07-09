"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  StickyNote, Plus, FileText, Edit3, Filter,
  Calendar, User, ChevronRight, Search, X,
} from "lucide-react";
import { NoteEditorModal, type NoteRecord } from "./NoteEditorModal";

/* ── Types ───────────────────────────────────────────────────────────────── */

type Props = {
  clientId:    string;
  clientName?: string;
  userName?:   string;
};

type FilterState = {
  typeFilter:   "ALL" | "BT_SESSION" | "BCBA" | "GENERAL";
  from:         string;
  to:           string;
  providerSearch: string;
};

/* ── Badge helpers ────────────────────────────────────────────────────────── */

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  BT_SESSION: { label: "BT",   cls: "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]" },
  BCBA:       { label: "BCBA", cls: "bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]" },
  GENERAL:    { label: "Note", cls: "bg-zinc-700/50 text-zinc-400" },
};

const BCBA_BADGE: Record<string, string> = {
  DSU:   "bg-emerald-400/10 text-emerald-400",
  TM:    "bg-amber-400/10 text-amber-400",
  TP:    "bg-blue-400/10 text-blue-400",
  PRT:   "bg-pink-400/10 text-pink-400",
  ASSES: "bg-orange-400/10 text-orange-400",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function contentPreview(content: string, maxLen = 120): string {
  const cleaned = content.replace(/\n+/g, " ").trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "…" : cleaned;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function SessionNotesTab({ clientId, clientName = "Client", userName = "" }: Props) {
  const qc = useQueryClient();

  const [filters, setFilters]           = useState<FilterState>({
    typeFilter:     "ALL",
    from:           "",
    to:             "",
    providerSearch: "",
  });
  const [showFilters,  setShowFilters]  = useState(false);
  const [editingNote,  setEditingNote]  = useState<NoteRecord | null | undefined>(undefined); // undefined = closed
  const [createType,   setCreateType]   = useState<"BT_SESSION" | "BCBA" | "GENERAL">("BT_SESSION");

  /* ── Query ── */
  const queryKey = ["notes", clientId, filters];

  const { data: notes = [], isLoading } = useQuery<NoteRecord[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ clientId });
      if (filters.typeFilter !== "ALL") params.set("type", filters.typeFilter);
      if (filters.from)  params.set("from", filters.from);
      if (filters.to)    params.set("to",   filters.to);
      const res = await fetch(`/smart-steps/api/notes?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  /* ── Filtered (client-side provider search) ── */
  const displayed = filters.providerSearch
    ? notes.filter((n) =>
        (n.providerName ?? n.user?.name ?? "").toLowerCase().includes(filters.providerSearch.toLowerCase())
      )
    : notes;

  /* ── Handlers ── */
  function invalidate() {
    qc.invalidateQueries({ queryKey: ["notes", clientId] });
  }

  function handleSaved() {
    invalidate();
    setEditingNote(undefined);
  }

  function handleDeleted() {
    invalidate();
    setEditingNote(undefined);
  }

  function openNew(type: "BT_SESSION" | "BCBA" | "GENERAL") {
    setCreateType(type);
    setEditingNote(null); // null = create mode
  }

  /* ── Render ── */
  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">

        {/* Type filter tabs */}
        <div className="flex gap-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-1">
          {(["ALL", "BT_SESSION", "BCBA", "GENERAL"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, typeFilter: t }))}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filters.typeFilter === t
                  ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "ALL" ? "All" : t === "BT_SESSION" ? "BT Notes" : t === "BCBA" ? "BCBA Notes" : "General"}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`tap-target inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border transition-all ${
            showFilters || filters.from || filters.to || filters.providerSearch
              ? "border-[var(--accent-cyan)] text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10"
              : "border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
        </button>

        {/* New note buttons */}
        <button
          type="button"
          onClick={() => openNew("BT_SESSION")}
          className="btn-secondary tap-target inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          New BT Note
        </button>
        <button
          type="button"
          onClick={() => openNew("BCBA")}
          className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          New BCBA Note
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
            <div className="glass-card rounded-2xl p-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">From date</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                  className="field-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">To date</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                  className="field-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Provider search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={filters.providerSearch}
                    onChange={(e) => setFilters((f) => ({ ...f, providerSearch: e.target.value }))}
                    placeholder="Therapist name…"
                    className="field-input w-full text-sm pl-8"
                  />
                </div>
              </div>
              {(filters.from || filters.to || filters.providerSearch) && (
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, from: "", to: "", providerSearch: "" }))}
                  className="col-span-full text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 w-fit"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Notes list ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
          <StickyNote className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium mb-1">No notes found</p>
          <p className="text-zinc-600 text-sm mb-6 max-w-xs mx-auto">
            {filters.typeFilter !== "ALL" || filters.from || filters.to || filters.providerSearch
              ? "No notes match the current filters."
              : "Create a BT session note or BCBA note to get started."}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              type="button"
              onClick={() => openNew("BT_SESSION")}
              className="btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
            >
              <FileText className="h-4 w-4" /> New BT Note
            </button>
            <button
              type="button"
              onClick={() => openNew("BCBA")}
              className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              <FileText className="h-4 w-4" /> New BCBA Note
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((note) => {
            const typeBadge = TYPE_BADGE[note.type] ?? TYPE_BADGE.GENERAL;
            return (
              <motion.button
                key={note.id}
                type="button"
                onClick={() => setEditingNote(note)}
                className="glass-card w-full rounded-2xl p-4 flex items-start gap-4 text-left hover:border-[var(--accent-cyan)]/40 transition-colors group"
                whileHover={{ x: 2 }}
              >
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                  <FileText className="h-4 w-4 text-zinc-400" />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {/* Type badge */}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeBadge.cls}`}>
                      {typeBadge.label}
                    </span>

                    {/* BCBA subtype badge */}
                    {note.type === "BCBA" && note.bcbaServiceType && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BCBA_BADGE[note.bcbaServiceType] ?? "text-zinc-400 bg-zinc-700/50"}`}>
                        {note.bcbaServiceType}
                      </span>
                    )}

                    {/* Generated badge */}
                    {note.isGenerated && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-zinc-500 border border-zinc-700">
                        auto-generated
                      </span>
                    )}

                    {/* Title */}
                    <p className="font-medium text-[var(--foreground)] text-sm truncate">
                      {note.title || "Untitled Note"}
                    </p>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(note.serviceDate ?? note.createdAt)}
                    </span>
                    {(note.providerName || note.user?.name) && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {note.providerName ?? note.user?.name}
                      </span>
                    )}
                    {note.type === "BCBA" && note.timeIn && (
                      <span>{note.timeIn}{note.timeOut ? ` – ${note.timeOut}` : ""}</span>
                    )}
                    {note.attendance && (
                      <span className={note.attendance === "Present" ? "text-emerald-400" : "text-zinc-500"}>
                        {note.attendance}
                      </span>
                    )}
                  </div>

                  {/* Content preview */}
                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                    {contentPreview(note.content)}
                  </p>
                </div>

                {/* Arrow */}
                <div className="shrink-0 flex items-center self-center">
                  <Edit3 className="h-4 w-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                  <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-[var(--accent-cyan)] transition-colors" />
                </div>
              </motion.button>
            );
          })}

          {displayed.length > 0 && (
            <p className="text-xs text-zinc-600 text-center pt-2">
              {displayed.length} note{displayed.length !== 1 ? "s" : ""} shown
            </p>
          )}
        </div>
      )}

      {/* ── Editor modal ── */}
      {editingNote !== undefined && (
        <NoteEditorModal
          clientId={clientId}
          clientName={clientName}
          note={editingNote}
          defaultType={createType}
          defaultDate={new Date().toISOString()}
          providerName={userName}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setEditingNote(undefined)}
        />
      )}
    </div>
  );
}
