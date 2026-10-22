/*
 * Session/note alignment repair.
 *
 * Dry run by default. Pass --apply to write.
 *
 * Two problems, two different levels of caution:
 *
 *  A. DATE DRIFT (safe, reversible). A generated note stores the session's
 *     service date at the moment it was generated. When the session was later
 *     moved to a different date, the note kept the old one, so the note and the
 *     session it documents disagree. The SESSION is authoritative: it holds the
 *     service window that reports, graphs and billing read, and it is what
 *     somebody deliberately edited. The note's serviceDate is realigned to it,
 *     and a generated title carrying the old date is retitled.
 *
 *  B. EXACT DUPLICATE NOTES (destructive, so narrowly scoped). Only notes that
 *     sit on the SAME session AND whose content, recommendations and next steps
 *     are byte-identical to an earlier copy are removed. By definition such a
 *     copy carries no information the kept note does not. The earliest copy is
 *     always kept. Notes on one session whose content DIFFERS are never touched
 *     — one of them may hold real work.
 *
 *     "Same client, same day, same type" is deliberately NOT treated as a
 *     duplicate: clients legitimately have two sessions in a day and each gets
 *     its own note.
 *
 * Every row that is changed or deleted is written to a JSON backup first.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import fs from "fs";
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const TZ = "America/New_York";
const day = (d) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }) : null);
const titleDate = (d) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });

const out = [];
const say = (...a) => { const l = a.join(" "); out.push(l); console.log(l); };

say(APPLY ? "*** APPLY MODE - writing ***" : "--- DRY RUN - nothing is written ---");
say("");

const notes = await prisma.note.findMany({
  select: {
    id: true, clientId: true, sessionId: true, type: true, bcbaServiceType: true,
    title: true, serviceDate: true, timeIn: true, timeOut: true, attendance: true,
    createdAt: true, updatedAt: true, isGenerated: true, btObservation: true,
    content: true, recommendations: true, nextSteps: true, providerName: true,
    userId: true,
    client: { select: { name: true } },
    session: { select: { id: true, startedAt: true, endedAt: true, deletedAt: true } },
  },
  orderBy: { createdAt: "asc" },
});

/* ── A. date drift ───────────────────────────────────────────────────────── */
say("=== A. NOTES WHOSE DATE DRIFTED FROM THEIR SESSION ===");
const drifted = notes.filter(
  (n) => n.session && !n.session.deletedAt && n.serviceDate &&
         day(n.serviceDate) !== day(n.session.startedAt)
);
say("to realign: " + drifted.length);
const dateFixes = [];
for (const n of drifted) {
  const wantDate = n.session.startedAt;
  const wantTitle = `BT Session Note - ${titleDate(wantDate)}`;
  /* Only a title the generator itself wrote is rewritten. A hand-written title
     is the author's words and is left exactly as it is. */
  const generatedTitle = /^BT Session Note\s*[-–—]\s*/.test(n.title ?? "");
  dateFixes.push({ id: n.id, newServiceDate: wantDate, newTitle: generatedTitle ? wantTitle : null });
  say(`  ${n.client?.name} | ${n.id}`);
  say(`     serviceDate ${day(n.serviceDate)} -> ${day(wantDate)}`);
  say(`     title "${n.title}" -> ${generatedTitle ? '"' + wantTitle + '"' : "(hand-written, left alone)"}`);
}
say("");

/* ── B. exact duplicates on one session ──────────────────────────────────── */
say("=== B. NOTES SHARING ONE SESSION ===");
const bySession = new Map();
for (const n of notes) {
  if (!n.sessionId) continue;
  if (!bySession.has(n.sessionId)) bySession.set(n.sessionId, []);
  bySession.get(n.sessionId).push(n);
}
const shared = [...bySession.entries()].filter(([, v]) => v.length > 1);
/* JSON, not a joined string: it needs no separator that could occur inside
   note text, and introduces no control bytes into this file. */
const fingerprint = (n) =>
  JSON.stringify([
    n.type,
    n.bcbaServiceType ?? "",
    (n.content ?? "").trim(),
    (n.recommendations ?? "").trim(),
    (n.nextSteps ?? "").trim(),
  ]);

const toDelete = [];
let differingGroups = 0, identicalGroups = 0;
for (const [sid, v] of shared) {
  const seen = new Map();
  const dupes = [];
  for (const n of v) {               // already ordered oldest first
    const fp = fingerprint(n);
    if (seen.has(fp)) dupes.push({ note: n, keptId: seen.get(fp) });
    else seen.set(fp, n.id);
  }
  if (dupes.length === 0) {
    differingGroups++;
    say(`  DIFFER  session ${sid} | ${v[0].client?.name} | ${day(v[0].session?.startedAt)} | ${v.length} notes, all distinct - LEFT ALONE`);
    for (const n of v) {
      say(`            ${n.id} ${n.type} len=${(n.content ?? "").trim().length} obs=${n.btObservation ? "yes" : "no"} created ${n.createdAt.toISOString()}`);
    }
    continue;
  }
  identicalGroups++;
  say(`  DUPES   session ${sid} | ${v[0].client?.name} | ${day(v[0].session?.startedAt)} | ${v.length} notes, ${dupes.length} exact copies`);
  for (const d of dupes) {
    toDelete.push(d.note);
    say(`            delete ${d.note.id} (identical to kept ${d.keptId}) created ${d.note.createdAt.toISOString()}`);
  }
  const remaining = v.length - dupes.length;
  if (remaining > 1) say(`            ${remaining} distinct notes remain on this session - left alone`);
}
say("");
say(`sessions with >1 note: ${shared.length}  (exact-copy groups ${identicalGroups}, all-distinct groups ${differingGroups})`);
say(`exact duplicate notes to delete: ${toDelete.length}`);

/* A duplicate must carry nothing of its own. Refuse to delete one that has an
   observation the kept copy lacks — that is a person's writing. */
const guarded = toDelete.filter((n) => (n.btObservation ?? "").trim());
if (guarded.length > 0) {
  say("");
  say("REFUSING to delete " + guarded.length + " copies that carry a therapist observation:");
  for (const n of guarded) say("   " + n.id);
}
const deletable = toDelete.filter((n) => !(n.btObservation ?? "").trim());
say("");
say("FINAL: realign " + dateFixes.length + " dates, delete " + deletable.length + " exact duplicate notes");

const backup = {
  generatedAt: new Date().toISOString(),
  dateFixes: drifted.map((n) => ({
    id: n.id, oldServiceDate: n.serviceDate, oldTitle: n.title,
    sessionId: n.sessionId, sessionStartedAt: n.session.startedAt,
  })),
  deletedNotes: deletable,
};
fs.writeFileSync("./note-fix-backup.json", JSON.stringify(backup, null, 2));
say("backup written: ./note-fix-backup.json");

if (APPLY) {
  let dated = 0, deleted = 0;
  for (const f of dateFixes) {
    await prisma.note.update({
      where: { id: f.id },
      data: { serviceDate: f.newServiceDate, ...(f.newTitle ? { title: f.newTitle } : {}) },
    });
    dated++;
  }
  for (const n of deletable) {
    await prisma.note.delete({ where: { id: n.id } });
    deleted++;
  }
  say("");
  say("APPLIED: " + dated + " dates realigned, " + deleted + " duplicate notes deleted");
}

fs.writeFileSync(
  APPLY ? "./note-fix-applied.log" : "./note-fix-dryrun.log",
  out.join("\n")
);
await prisma.$disconnect();
