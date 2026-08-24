"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Save, FileText, User, Calendar, Clock, CheckCircle,
  ChevronDown, Sparkles, Trash2, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { printSessionNotes, type PrintableNote } from "@/lib/printNotes";
import { NOTE_TYPES, BCBA_SERVICE_TYPES, bcbaServiceLabel } from "@/lib/noteTypes";
import { TimeInput12h } from "@/components/common/TimeInput12h";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type NoteRecord = {
  id:              string;
  clientId:        string;
  userId:          string;
  sessionId:       string | null;
  title:           string | null;
  type:            string;
  bcbaServiceType: string | null;
  serviceDate:     string | null;
  timeIn:          string | null;
  timeOut:         string | null;
  attendance:      string | null;
  content:         string;
  recommendations: string | null;
  nextSteps:       string | null;
  providerName:    string | null;
  isGenerated:     boolean;
  createdAt:       string;
  updatedAt:       string;
  user?:           { id: string; name: string | null; role: string; credentials?: string | null } | null;
  /** The session this note was written for, when it came from one. */
  session?:        {
    id:        string;
    startedAt: string;
    endedAt:   string | null;
    mode:      string;
    user?:     { id: string; name: string | null } | null;
  } | null;
};

type Props = {
  clientId:       string;
  clientName?:    string;
  note?:          NoteRecord | null;        // null = create mode
  defaultType?:   "BT_SESSION" | "BCBA" | "GENERAL";
  defaultDate?:   string;                   // ISO string
  providerName?:  string;
  onSaved:        (note?: NoteRecord) => void;
  onDeleted?:     (noteId?: string) => void;
  onClose:        () => void;
};

/* ── Constants ──────────────────────────────────────────────────────────────── */

const ATTENDANCE_OPTIONS = [
  "Present",
  "Parent Only",
  "Make-up Session",
  "Absent – Caregiver",
  "Absent – Client ill",
  "Cancelled – Provider",
  "Cancelled – Caregiver",
];

/* ── Helper ─────────────────────────────────────────────────────────────────── */

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return new Date(iso).toISOString().slice(0, 10);
}

function bcbaDefaultContent(serviceType: string, clientName: string, providerName: string): string {
  const p = providerName || "the BCBA";
  const c = clientName || "the client";
  const map: Record<string, string> = {
    DSU:   `${p} conducted direct supervision of ABA therapy services for ${c}. The BCBA observed therapist implementation of treatment procedures, reviewed data collected during the session, and provided corrective and positive feedback to support procedural fidelity. Clinical recommendations were discussed and documented.`,
    TM:    `${p} participated in a team meeting regarding the treatment program for ${c}. Topics discussed included current progress toward goals and targets, data review, and coordination of services among team members. Action items and next steps were identified and documented.`,
    TP:    `${p} conducted treatment planning for ${c}. Current goals and targets were reviewed and updated based on recent session data. The behavior intervention plan was evaluated for clinical appropriateness. Mastery criteria, teaching procedures, and reinforcement strategies were assessed and modified as clinically indicated.`,
    PRT:   `${p} provided parent/caregiver training for the family of ${c}. ABA strategies and intervention procedures were reviewed, modeled, and practiced. The caregiver demonstrated emerging understanding of techniques. Feedback was provided and questions were addressed. Home programming recommendations were discussed.`,
    ASSES: `${p} conducted an assessment for ${c}. Assessment activities were administered, observed, and scored according to standardized procedures. Results and observations were documented. Findings will be used to inform treatment planning, goal development, and program modifications.`,
  };
  return map[serviceType] ?? `${p} provided clinical services for ${c}.`;
}

/* ── Provider picker ─────────────────────────────────────────────────────────── */

type ProviderOption = {
  id:          string;
  name:        string | null;
  role:        string;
  displayRole: string | null;
};

const CUSTOM_PROVIDER = "__custom__";

/**
 * Provider / BCBA selector.
 *
 * A note stores the provider as a NAME (`Note.providerName`), not a user id, so
 * this picks from the active staff list but keeps a free-text escape hatch:
 * a supervisor from outside the agency, or a name on an older note whose
 * profile has since been deactivated, still has to be selectable and saveable.
 * An unrecognised value is offered as its own option so editing an old note
 * never silently blanks its provider.
 */
function ProviderSelect({
  value,
  onChange,
  placeholder,
}: {
  value:       string;
  onChange:    (value: string) => void;
  placeholder: string;
}) {
  const [customEntry, setCustomEntry] = useState(false);

  const { data: providers = [] } = useQuery<ProviderOption[]>({
    queryKey: ["providers-dropdown"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/users?forDropdown=1");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const named = providers.filter((p) => !!p.name);
  const isKnown = named.some((p) => p.name === value);

  if (customEntry) {
    return (
      <div className="space-y-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="field-input w-full text-sm"
          autoFocus
        />
        <button
          type="button"
          onClick={() => setCustomEntry(false)}
          className="text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          Choose from staff instead
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === CUSTOM_PROVIDER) { setCustomEntry(true); onChange(""); return; }
          onChange(e.target.value);
        }}
        className="field-input w-full text-sm appearance-none pr-8"
      >
        <option value="">{placeholder}</option>
        {value && !isKnown && <option value={value}>{value}</option>}
        {named.map((p) => (
          <option key={p.id} value={p.name as string}>
            {p.name}
            {p.displayRole ? ` — ${p.displayRole}` : p.role !== "RBT" ? ` — ${p.role}` : ""}
          </option>
        ))}
        <option value={CUSTOM_PROVIDER}>Other — type a name…</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────────────── */

export function NoteEditorModal({
  clientId,
  clientName = "Client",
  note,
  defaultType   = "BT_SESSION",
  defaultDate,
  providerName  = "",
  onSaved,
  onDeleted,
  onClose,
}: Props) {
  const isEdit = !!note;

  const [type,            setType]            = useState(note?.type            ?? defaultType);
  const [bcbaServiceType, setBcbaServiceType] = useState(note?.bcbaServiceType ?? "DSU");
  const [title,           setTitle]           = useState(note?.title           ?? "");
  const [serviceDate,     setServiceDate]     = useState(toDateInputValue(note?.serviceDate ?? defaultDate));
  const [timeIn,          setTimeIn]          = useState(note?.timeIn          ?? "");
  const [timeOut,         setTimeOut]         = useState(note?.timeOut         ?? "");
  const [attendance,      setAttendance]      = useState(note?.attendance      ?? "Present");
  const [provider,        setProvider]        = useState(note?.providerName    ?? providerName);
  const [content,         setContent]         = useState(note?.content         ?? "");
  const [recommendations, setRecommendations] = useState(note?.recommendations ?? "");
  const [nextSteps,       setNextSteps]       = useState(note?.nextSteps       ?? "");
  /* An existing saved title counts as hand-written — auto-titling only ever
     fills a title the user has not authored. */
  const [titleTouched,    setTitleTouched]    = useState(!!note?.title);
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [confirmDelete,   setConfirmDelete]   = useState(false);

  /* Auto-fill BCBA template when service type changes in create mode */
  useEffect(() => {
    if (!isEdit && type === "BCBA" && !content) {
      setContent(bcbaDefaultContent(bcbaServiceType, clientName, provider));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bcbaServiceType]);

  /* Auto-title — tracks the note-type dropdown until the user types their own */
  useEffect(() => {
    if (titleTouched) return;
    const dateStr = serviceDate
      ? new Date(serviceDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";
    const suffix = dateStr ? " – " + dateStr : "";
    if (type === "BT_SESSION")  setTitle(`BT Session Note${suffix}`);
    else if (type === "BCBA")   setTitle(`${bcbaServiceLabel(bcbaServiceType)} Note${suffix}`);
    else                        setTitle("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, bcbaServiceType, serviceDate, titleTouched]);

  async function handleSave() {
    if (!content.trim()) { toast.error("Note content is required."); return; }
    setSaving(true);
    try {
      const payload = {
        clientId,
        type,
        bcbaServiceType: type === "BCBA" ? bcbaServiceType : undefined,
        title:           title   || undefined,
        serviceDate:     serviceDate ? new Date(serviceDate + "T12:00:00").toISOString() : undefined,
        timeIn:          timeIn  || undefined,
        timeOut:         timeOut || undefined,
        attendance:      attendance || undefined,
        content,
        recommendations: recommendations || undefined,
        nextSteps:       nextSteps || undefined,
        providerName:    provider  || undefined,
      };

      let res: Response;
      if (isEdit) {
        res = await fetch(`/smart-steps/api/notes/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/smart-steps/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }

      const saved = await res.json() as NoteRecord;
      toast.success(isEdit ? "Note updated." : "Note saved.");
      onSaved(saved);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    const printable: PrintableNote = {
      id: note?.id ?? "draft",
      title: title || null,
      type,
      bcbaServiceType: type === "BCBA" ? bcbaServiceType : null,
      serviceDate: serviceDate ? new Date(serviceDate + "T12:00:00").toISOString() : null,
      timeIn: timeIn || null,
      timeOut: timeOut || null,
      attendance: attendance || null,
      content,
      recommendations: recommendations || null,
      nextSteps: nextSteps || null,
      providerName: provider || null,
      createdAt: note?.createdAt ?? new Date().toISOString(),
      user: note?.user ? { name: note.user.name, credentials: note.user.credentials ?? null } : null,
    };
    const ok = printSessionNotes([printable], clientName);
    if (!ok) toast.error("Pop-up blocked — allow pop-ups and try again.");
  }

  async function handleDelete() {
    if (!note) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/smart-steps/api/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Note deleted.");
      onDeleted?.(note.id);
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const isBcba = type === "BCBA";
  const isBt   = type === "BT_SESSION";

  /** True while the narrative is still one of the generated service templates. */
  function isTemplateContent(text: string): boolean {
    if (!text.trim()) return true;
    return BCBA_SERVICE_TYPES.some((st) => bcbaDefaultContent(st.id, clientName, provider) === text);
  }

  /**
   * Switching service type re-seeds the narrative, but only while it is still
   * boilerplate — a BCBA who has started writing never loses their text.
   */
  function handleServiceTypeChange(next: string) {
    setBcbaServiceType(next);
    if (!isEdit && isTemplateContent(content)) {
      setContent(bcbaDefaultContent(next, clientName, provider));
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="note-modal-backdrop"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="note-modal-panel"
          className="relative flex flex-col w-full sm:max-w-3xl max-h-[96dvh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl border border-[var(--glass-border)] bg-[var(--background)] shadow-2xl overflow-hidden"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-5 py-4 shrink-0">
            <div className="rounded-xl bg-[var(--accent-cyan)]/10 p-2 text-[var(--accent-cyan)]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {isEdit ? "Edit Note" : "New Note"}
              </p>
              {note?.isGenerated && (
                <p className="text-[11px] text-[var(--accent-cyan)] flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Auto-generated — all fields editable
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Note type selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Note Category</label>
              <div className="flex gap-2 flex-wrap">
                {NOTE_TYPES.map((nt) => (
                  <button
                    key={nt.id}
                    type="button"
                    onClick={() => setType(nt.id)}
                    className={`rounded-xl px-3.5 py-2 text-sm font-medium border transition-all ${
                      type === nt.id
                        ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                        : "border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {nt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* BCBA service info table */}
            {isBcba && (
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Service Information</p>
                <div className="grid gap-3 sm:grid-cols-2">

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Service Date
                    </label>
                    <input
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      className="field-input w-full text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 flex items-center gap-1">
                      <User className="h-3 w-3" /> Provider / BCBA
                    </label>
                    <ProviderSelect value={provider} onChange={setProvider} placeholder="Select provider..." />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Time In
                    </label>
                    <TimeInput12h value={timeIn} onChange={setTimeIn} ariaLabel="Time in" />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Time Out
                    </label>
                    <TimeInput12h value={timeOut} onChange={setTimeOut} ariaLabel="Time out" />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Attendance
                    </label>
                    <div className="relative">
                      <select
                        value={attendance}
                        onChange={(e) => setAttendance(e.target.value)}
                        className="field-input w-full text-sm appearance-none pr-8"
                      >
                        {ATTENDANCE_OPTIONS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BT Session info row */}
            {isBt && (
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Session Information</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Session Date</label>
                    <input
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      className="field-input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Provider / Therapist</label>
                    <ProviderSelect value={provider} onChange={setProvider} placeholder="Select therapist..." />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Attendance</label>
                    <div className="relative">
                      <select
                        value={attendance}
                        onChange={(e) => setAttendance(e.target.value)}
                        className="field-input w-full text-sm appearance-none pr-8"
                      >
                        {ATTENDANCE_OPTIONS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* General note date + provider */}
            {!isBcba && !isBt && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Note Date</label>
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    className="field-input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Author / Provider</label>
                  <ProviderSelect value={provider} onChange={setProvider} placeholder="Select provider..." />
                </div>
              </div>
            )}

            {/* Title + (for BCBA notes) the service-type dropdown that names it */}
            <div className={`grid gap-3 ${isBcba ? "sm:grid-cols-[minmax(0,1fr)_15rem]" : ""}`}>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
                  placeholder={
                    isBcba ? `${bcbaServiceLabel(bcbaServiceType)} Note – Date`
                    : isBt ? "BT Session Note – Date"
                    : "Note title"
                  }
                  className="field-input w-full text-sm"
                />
              </div>

              {isBcba && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Note Type</label>
                  <div className="relative">
                    <select
                      value={bcbaServiceType}
                      onChange={(e) => handleServiceTypeChange(e.target.value)}
                      className="field-input w-full text-sm appearance-none pr-8"
                    >
                      {BCBA_SERVICE_TYPES.map((st) => (
                        <option key={st.id} value={st.id}>{st.label} ({st.code})</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                  </div>
                </div>
              )}
            </div>

            {/* Main narrative / content */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                {isBcba ? "Narrative" : isBt ? "Session Content" : "Note Content"}
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={isBcba ? 8 : 12}
                placeholder={
                  isBcba
                    ? "Describe services provided, observations, and clinical rationale…"
                    : isBt
                    ? "Session summary, goals addressed, progress, behavioral observations…"
                    : "Note content…"
                }
                className="field-input w-full resize-y text-sm font-mono leading-relaxed"
              />
              <p className="text-[11px] text-zinc-600 mt-1">Fully editable. All formatting is preserved.</p>
            </div>

            {/* Recommendations — BT and BCBA */}
            {(isBt || isBcba) && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Recommendations</label>
                <textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  rows={4}
                  placeholder="Clinical recommendations for the treatment team…"
                  className="field-input w-full resize-y text-sm"
                />
              </div>
            )}

            {/* Next steps — BT */}
            {isBt && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Next Session Focus</label>
                <textarea
                  value={nextSteps}
                  onChange={(e) => setNextSteps(e.target.value)}
                  rows={3}
                  placeholder="Focus areas and targets for the next session…"
                  className="field-input w-full resize-y text-sm"
                />
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[var(--glass-border)] px-5 py-4 flex items-center gap-3">
            {isEdit && onDeleted && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={`tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 ${
                  confirmDelete
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                    : "text-zinc-500 hover:text-rose-400 border border-transparent hover:border-rose-500/30"
                }`}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            )}
            {confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Cancel
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={handlePrint}
              className="tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-zinc-400 border border-[var(--glass-border)] hover:text-zinc-200"
              title="Export this note to PDF"
            >
              <Printer className="h-4 w-4" />
              PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="tap-target rounded-xl px-4 py-2.5 text-sm text-zinc-400 border border-[var(--glass-border)] hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Note"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
