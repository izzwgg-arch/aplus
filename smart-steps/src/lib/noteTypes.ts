/**
 * Note taxonomy — the single source of truth for what KIND of note a record is.
 *
 * `Note.type` is the broad category (BT session / BCBA / general) and, for a
 * BCBA note, `Note.bcbaServiceType` is the billable service that was delivered.
 * The codes are what the API validates and what the DB stores; the labels are
 * what a clinician reads in the note-type dropdown, on the note cards and in
 * the printed PDF. Keep the ids in sync with `VALID_BCBA` in
 * `src/app/api/notes/route.ts`.
 */

export type NoteType = "BT_SESSION" | "BCBA" | "GENERAL";

export const NOTE_TYPES = [
  { id: "BT_SESSION", label: "BT Session Note" },
  { id: "BCBA",       label: "BCBA Note"       },
  { id: "GENERAL",    label: "General Note"    },
] as const;

export const NOTE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  NOTE_TYPES.map((t) => [t.id, t.label]),
);

/**
 * BCBA service types. `label` is the plain-English name a BCBA picks from the
 * dropdown next to the note title, `code` is the billing abbreviation.
 */
export const BCBA_SERVICE_TYPES = [
  { id: "DSU",   code: "DSU",   label: "Direct Supervision" },
  { id: "TM",    code: "TM",    label: "Team Meeting"       },
  { id: "TP",    code: "TP",    label: "Treatment Planning" },
  { id: "PRT",   code: "PRT",   label: "Parent Training"    },
  { id: "ASSES", code: "ASSES", label: "Assessment"         },
] as const;

export type BcbaServiceType = (typeof BCBA_SERVICE_TYPES)[number]["id"];

/** "Direct Supervision" — falls back to the raw code for legacy/unknown values. */
export function bcbaServiceLabel(id: string | null | undefined): string {
  if (!id) return "";
  return BCBA_SERVICE_TYPES.find((s) => s.id === id)?.label ?? id;
}

/** "Direct Supervision (DSU)" — used where the billing code has to be visible. */
export function bcbaServiceLabelWithCode(id: string | null | undefined): string {
  if (!id) return "";
  const match = BCBA_SERVICE_TYPES.find((s) => s.id === id);
  return match ? `${match.label} (${match.code})` : id;
}
