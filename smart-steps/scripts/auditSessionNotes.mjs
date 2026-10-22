/* READ-ONLY audit of session/note date alignment, duplicates and orphans. */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import fs from "fs";
const prisma = new PrismaClient();

const TZ = "America/New_York";
const day = (d) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }) : null);
const stamp = (d) =>
  d
    ? new Date(d).toLocaleString("en-US", {
        timeZone: TZ, month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : "-";

const out = [];
const say = (...a) => { const l = a.join(" "); out.push(l); console.log(l); };

const notes = await prisma.note.findMany({
  select: {
    id: true, clientId: true, sessionId: true, type: true, bcbaServiceType: true,
    title: true, serviceDate: true, createdAt: true, updatedAt: true,
    isGenerated: true, btObservation: true, content: true, providerName: true,
    client: { select: { name: true } },
    user: { select: { name: true } },
    session: {
      select: {
        id: true, startedAt: true, endedAt: true, deletedAt: true,
        clientId: true, userId: true,
      },
    },
  },
  orderBy: { serviceDate: "asc" },
});

const sessions = await prisma.session.findMany({
  where: { deletedAt: null },
  select: {
    id: true, clientId: true, startedAt: true, endedAt: true, mode: true, userId: true,
    client: { select: { name: true } },
    user: { select: { name: true } },
    _count: { select: { trials: { where: { deletedAt: null } }, sessionNotes: true } },
  },
  orderBy: { startedAt: "asc" },
});

say("TOTALS: notes=" + notes.length + "  live sessions=" + sessions.length);
say("");

/* 1. A note linked to a session but on a DIFFERENT service date. */
say("=== 1. LINKED NOTE / SESSION DATE MISMATCH ===");
const mismatch = notes.filter(
  (n) => n.session && n.serviceDate && day(n.serviceDate) !== day(n.session.startedAt)
);
say("count: " + mismatch.length);
for (const n of mismatch) {
  say("  " + n.client?.name + " | note " + n.id + " " + n.type +
      (n.bcbaServiceType ? "/" + n.bcbaServiceType : "") +
      " title=" + (n.title ?? "").slice(0, 40));
  say("     note serviceDate " + day(n.serviceDate) + "  vs  session " + n.session.id +
      " startedAt " + day(n.session.startedAt) + " (" + stamp(n.session.startedAt) + ")");
  say("     note created " + stamp(n.createdAt) + " updated " + stamp(n.updatedAt) +
      " generated=" + n.isGenerated);
}
say("");

/* 2. A note whose session belongs to a different client. */
say("=== 2. NOTE LINKED TO ANOTHER CLIENTS SESSION ===");
const wrongClient = notes.filter((n) => n.session && n.session.clientId !== n.clientId);
say("count: " + wrongClient.length);
for (const n of wrongClient) {
  say("  note " + n.id + " client " + n.clientId + " (" + n.client?.name +
      ") -> session " + n.session.id + " client " + n.session.clientId);
}
say("");

/* 3. A note pointing at a SOFT-DELETED session. */
say("=== 3. NOTE ON A DELETED SESSION ===");
const onDeleted = notes.filter((n) => n.session && n.session.deletedAt);
say("count: " + onDeleted.length);
for (const n of onDeleted) {
  say("  " + n.client?.name + " | note " + n.id + " " + n.type + " " + day(n.serviceDate) +
      " -> session " + n.session.id + " deleted " + stamp(n.session.deletedAt));
}
say("");

/* 4. Duplicate notes: same client, same service date, same type and subtype. */
say("=== 4. DUPLICATE NOTES (same client + date + type) ===");
const byKey = new Map();
for (const n of notes) {
  if (!n.serviceDate) continue;
  const k = [n.clientId, day(n.serviceDate), n.type, n.bcbaServiceType ?? ""].join("|");
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(n);
}
const dupGroups = [...byKey.entries()].filter(([, v]) => v.length > 1);
say("groups: " + dupGroups.length +
    "  extra rows: " + dupGroups.reduce((s, [, v]) => s + v.length - 1, 0));
for (const [k, v] of dupGroups) {
  const parts = k.split("|");
  say("  " + v[0].client?.name + " | " + parts[1] + " | " + parts[2] +
      (parts[3] ? "/" + parts[3] : "") + " | " + v.length + " notes");
  for (const n of v) {
    const same = v.filter((o) => o.content.trim() === n.content.trim()).length;
    say("     " + n.id + " session=" + (n.sessionId ?? "-") +
        " gen=" + n.isGenerated + " obs=" + (n.btObservation ? "yes" : "no") +
        " created " + stamp(n.createdAt) + " len=" + n.content.trim().length +
        " identicalCopies=" + same + " author=" + (n.user?.name ?? "?"));
  }
}
say("");

/* 5. More than one note on a single session. */
say("=== 5. SESSIONS WITH MORE THAN ONE NOTE ===");
const bySession = new Map();
for (const n of notes) {
  if (!n.sessionId) continue;
  if (!bySession.has(n.sessionId)) bySession.set(n.sessionId, []);
  bySession.get(n.sessionId).push(n);
}
const multi = [...bySession.entries()].filter(([, v]) => v.length > 1);
say("count: " + multi.length);
for (const [sid, v] of multi) {
  say("  session " + sid + " | " + v[0].client?.name + " | " +
      day(v[0].session?.startedAt) + " | " + v.length + " notes");
  for (const n of v) {
    say("     " + n.id + " " + n.type + (n.bcbaServiceType ? "/" + n.bcbaServiceType : "") +
        " gen=" + n.isGenerated + " obs=" + (n.btObservation ? "yes" : "no") +
        " created " + stamp(n.createdAt) + " len=" + n.content.trim().length);
  }
}
say("");

/* 6. Unmatched BT notes: no session link. */
say("=== 6. BT NOTES WITH NO SESSION LINK ===");
const sessByClientDay = new Map();
for (const s of sessions) {
  const k = s.clientId + "|" + day(s.startedAt);
  if (!sessByClientDay.has(k)) sessByClientDay.set(k, []);
  sessByClientDay.get(k).push(s);
}
const unlinkedBt = notes.filter((n) => n.type === "BT_SESSION" && !n.sessionId);
say("count: " + unlinkedBt.length);
let matchable = 0, noSession = 0, ambiguous = 0;
const matchPlan = [];
for (const n of unlinkedBt) {
  const cands = sessByClientDay.get(n.clientId + "|" + day(n.serviceDate)) ?? [];
  const free = cands.filter((s) => s._count.sessionNotes === 0);
  let verdict;
  if (cands.length === 0) { verdict = "NO SESSION THAT DAY"; noSession++; }
  else if (free.length === 1) {
    verdict = "MATCHABLE -> " + free[0].id;
    matchable++;
    matchPlan.push({ noteId: n.id, sessionId: free[0].id, client: n.client?.name, date: day(n.serviceDate) });
  } else {
    verdict = "AMBIGUOUS (" + cands.length + " sessions, " + free.length + " without a note)";
    ambiguous++;
  }
  say("  " + n.client?.name + " | " + day(n.serviceDate) + " | note " + n.id +
      " gen=" + n.isGenerated + " obs=" + (n.btObservation ? "yes" : "no") + " | " + verdict);
}
say("  summary: matchable=" + matchable + " noSessionThatDay=" + noSession + " ambiguous=" + ambiguous);
say("");

/* 7. Sessions with trials and no note at all. */
say("=== 7. SESSIONS WITH TRIALS AND NO NOTE ===");
const noNote = sessions.filter((s) => s._count.sessionNotes === 0 && s._count.trials > 0);
say("count: " + noNote.length + " (of " + sessions.length + " live sessions)");
const byClient = new Map();
for (const s of noNote) {
  const c = s.client?.name ?? "?";
  byClient.set(c, (byClient.get(c) ?? 0) + 1);
}
for (const [c, n] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) say("  " + n + "  " + c);
say("");

/* 8. THE WORK LIST: BT session notes still missing the therapist observation. */
say("=== 8. BT NOTES MISSING THE THERAPIST OBSERVATION ===");
const needObs = notes.filter((n) => n.type === "BT_SESSION" && !(n.btObservation ?? "").trim());
const haveObs = notes.filter((n) => n.type === "BT_SESSION" && (n.btObservation ?? "").trim());
say("missing: " + needObs.length + "   already written: " + haveObs.length);
const obsByClient = new Map();
for (const n of needObs) {
  const c = n.client?.name ?? "?";
  if (!obsByClient.has(c)) obsByClient.set(c, []);
  obsByClient.get(c).push(n);
}
for (const [c, list] of [...obsByClient.entries()].sort((a, b) => b[1].length - a[1].length)) {
  say("  " + c + " - " + list.length);
  for (const n of list.slice(-4)) {
    say("     " + day(n.serviceDate) + "  note " + n.id + "  provider " +
        (n.providerName ?? n.user?.name ?? "?"));
  }
  if (list.length > 4) say("     ... and " + (list.length - 4) + " older");
}
say("");

/* 9. Notes with no service date at all. */
say("=== 9. NOTES WITH NO SERVICE DATE ===");
const noDate = notes.filter((n) => !n.serviceDate);
say("count: " + noDate.length);
for (const n of noDate) {
  say("  " + n.client?.name + " | note " + n.id + " " + n.type +
      " created " + stamp(n.createdAt) + " session=" + (n.sessionId ?? "-"));
}

fs.writeFileSync("./note-session-audit.log", out.join("\n"));
fs.writeFileSync("./note-session-matchplan.json", JSON.stringify(matchPlan, null, 2));
console.log("");
console.log("written ./note-session-audit.log");
await prisma.$disconnect();
