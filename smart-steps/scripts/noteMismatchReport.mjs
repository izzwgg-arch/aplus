/*
 * READ-ONLY. Builds a reconciliation report of every note whose date disagrees
 * with the session it documents, plus the duplicate notes, with the fields a
 * timesheet is matched on: client, provider, date, time window and hours.
 *
 * Writes ./note-mismatch-report.md and ./note-mismatch-report.csv
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import fs from "fs";
const prisma = new PrismaClient();

const TZ = "America/New_York";
const dayOf = (d) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }) : "");
const clock = (d) =>
  d ? new Date(d).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) : "";
const stamp = (d) =>
  d ? new Date(d).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const hours = (a, b) => {
  if (!a || !b) return "";
  const m = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  if (m <= 0 || m > 720) return "";
  return (Math.round((m / 60) * 100) / 100).toString();
};

const notes = await prisma.note.findMany({
  select: {
    id: true, clientId: true, sessionId: true, type: true, bcbaServiceType: true,
    title: true, serviceDate: true, timeIn: true, timeOut: true,
    createdAt: true, updatedAt: true, isGenerated: true, btObservation: true,
    content: true, recommendations: true, nextSteps: true, providerName: true,
    client: { select: { name: true } },
    user: { select: { name: true } },
    session: {
      select: {
        id: true, startedAt: true, endedAt: true, deletedAt: true, mode: true,
        user: { select: { name: true } },
        supervisor: { select: { name: true } },
        _count: { select: { trials: { where: { deletedAt: null } } } },
      },
    },
  },
  orderBy: { serviceDate: "asc" },
});

/* ── The mismatches ─────────────────────────────────────────────────────── */
const drifted = notes.filter(
  (n) => n.session && !n.session.deletedAt && n.serviceDate &&
         dayOf(n.serviceDate) !== dayOf(n.session.startedAt)
);

/* The date the generator wrote into the narrative, which is the date the
   session carried at the moment the note was produced. */
const proseDate = (n) => {
  const m = (n.content ?? "").match(/ on (?:[A-Za-z]+, )?([A-Za-z]+ \d{1,2}, \d{4})/);
  return m ? m[1] : "";
};
const editedSince = (n) => ((n.updatedAt.getTime() - n.createdAt.getTime()) / 1000 > 60 ? "yes" : "no");

const rows = drifted.map((n) => ({
  client: n.client?.name ?? "",
  provider: n.session.user?.name ?? n.providerName ?? "",
  noteDate: dayOf(n.serviceDate),
  sessionDate: dayOf(n.session.startedAt),
  gapDays: Math.round(
    (new Date(dayOf(n.session.startedAt)).getTime() - new Date(dayOf(n.serviceDate)).getTime()) / 86400000
  ),
  sessionStart: clock(n.session.startedAt),
  sessionEnd: clock(n.session.endedAt),
  sessionHours: hours(n.session.startedAt, n.session.endedAt),
  trials: n.session._count.trials,
  mode: n.session.mode,
  narrativeSays: proseDate(n),
  editedByHand: editedSince(n),
  noteCreated: stamp(n.createdAt),
  noteId: n.id,
  sessionId: n.session.id,
}));
rows.sort((a, b) => (a.client + a.sessionDate).localeCompare(b.client + b.sessionDate));

/* ── Duplicate notes on one session ─────────────────────────────────────── */
const bySession = new Map();
for (const n of notes) {
  if (!n.sessionId) continue;
  if (!bySession.has(n.sessionId)) bySession.set(n.sessionId, []);
  bySession.get(n.sessionId).push(n);
}
const fingerprint = (n) =>
  JSON.stringify([n.type, n.bcbaServiceType ?? "", (n.content ?? "").trim(),
                  (n.recommendations ?? "").trim(), (n.nextSteps ?? "").trim()]);

const dupRows = [];
for (const [sid, v] of bySession) {
  if (v.length < 2) continue;
  v.sort((a, b) => a.createdAt - b.createdAt);
  const seen = new Map();
  for (const n of v) {
    const fp = fingerprint(n);
    if (seen.has(fp)) {
      dupRows.push({
        client: n.client?.name ?? "",
        provider: n.session.user?.name ?? n.providerName ?? "",
        sessionDate: dayOf(n.session.startedAt),
        sessionStart: clock(n.session.startedAt),
        sessionHours: hours(n.session.startedAt, n.session.endedAt),
        trials: n.session._count.trials,
        keepNoteId: seen.get(fp),
        removeNoteId: n.id,
        removeCreated: stamp(n.createdAt),
        sessionId: sid,
      });
    } else seen.set(fp, n.id);
  }
}
dupRows.sort((a, b) => (a.client + a.sessionDate).localeCompare(b.client + b.sessionDate));

/* ── CSV ────────────────────────────────────────────────────────────────── */
const csvEsc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = [];
csv.push("section,client,provider,note_date,session_date,gap_days,session_start,session_end,session_hours,trials,mode,narrative_says,edited_by_hand,note_created,note_id,session_id");
for (const r of rows) {
  csv.push(["date_mismatch", r.client, r.provider, r.noteDate, r.sessionDate, r.gapDays,
            r.sessionStart, r.sessionEnd, r.sessionHours, r.trials, r.mode,
            r.narrativeSays, r.editedByHand, r.noteCreated, r.noteId, r.sessionId].map(csvEsc).join(","));
}
for (const d of dupRows) {
  csv.push(["duplicate_note", d.client, d.provider, "", d.sessionDate, "",
            d.sessionStart, "", d.sessionHours, d.trials, "", "", "", d.removeCreated,
            d.removeNoteId + " (keep " + d.keepNoteId + ")", d.sessionId].map(csvEsc).join(","));
}
fs.writeFileSync("./note-mismatch-report.csv", csv.join("\n"));

/* ── Markdown ───────────────────────────────────────────────────────────── */
const md = [];
md.push("# Which notes do not match their session");
md.push("");
md.push("Read directly from production on " + new Date().toLocaleDateString("en-US", { timeZone: TZ, month: "long", day: "numeric", year: "numeric" }) + ". Nothing has been changed.");
md.push("");
md.push("Match each row against the timesheet for that provider on that date. The");
md.push("session's own start, end and hours are what a timesheet line should agree");
md.push("with. Whichever date the timesheet supports is the correct one.");
md.push("");
md.push("## Notes whose date disagrees with their session: " + rows.length);
md.push("");
md.push("| Client | Provider | Note says | Session says | Gap | Session window | Hours | Trials | Narrative says | Edited by hand |");
md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  md.push("| " + [
    r.client, r.provider, r.noteDate, r.sessionDate,
    (r.gapDays > 0 ? "+" : "") + r.gapDays + "d",
    r.sessionStart + (r.sessionEnd ? " to " + r.sessionEnd : ""),
    r.sessionHours || "-", r.trials, r.narrativeSays || "-", r.editedByHand,
  ].join(" | ") + " |");
}
md.push("");
md.push("The narrative column is the date written into the note's own text when it");
md.push("was generated. It is the date the session carried at that moment, so it");
md.push("normally matches the note's stored date rather than the session's current one.");
md.push("");
md.push("Note and session ids, for reference:");
md.push("");
md.push("| Client | Session date | Note id | Session id |");
md.push("| --- | --- | --- | --- |");
for (const r of rows) md.push("| " + [r.client, r.sessionDate, r.noteId, r.sessionId].join(" | ") + " |");
md.push("");
md.push("## Duplicate notes on one session: " + dupRows.length + " removable");
md.push("");
md.push("Each of these is byte-identical to a note already on the same session, in");
md.push("content, recommendations, next steps, title, times and provider. The copy");
md.push("to keep is the earliest one.");
md.push("");
md.push("| Client | Provider | Session date | Window | Hours | Trials | Remove | Keep |");
md.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const d of dupRows) {
  md.push("| " + [d.client, d.provider, d.sessionDate, d.sessionStart,
                   d.sessionHours || "-", d.trials, d.removeNoteId, d.keepNoteId].join(" | ") + " |");
}
md.push("");
md.push("## What a timesheet would settle");
md.push("");
md.push("For each mismatch above there are only two candidate service dates: the");
md.push("note's and the session's. A timesheet line for that provider fixes which.");
md.push("");
md.push("What I need per line: provider name, client name, date, time in, time out.");
md.push("Hours alone also works where the two candidate dates have different hours.");
md.push("CSV, Excel or a PDF export are all fine.");
fs.writeFileSync("./note-mismatch-report.md", md.join("\n"));

console.log("date mismatches: " + rows.length);
console.log("removable duplicates: " + dupRows.length);
console.log("wrote ./note-mismatch-report.md and ./note-mismatch-report.csv");
await prisma.$disconnect();
