// Restores goals (Target) to their ORIGINAL skill area (ParentGoal), undoing
// three stacked migrations (2026-11-12 .. 2026-11-17):
//   1. completeParentGoalMigration moved every Target off its ParentGoal onto a
//      Program whose name == the skill area's title (created one when missing,
//      description 'Created from ParentGoal "<title>"').
//   2. fixGoalHierarchy wrapped each program-direct Target in a NEW ParentGoal
//      titled with the goal sentence ('Auto-created skill area for: ...').
//   3. fix_final moved those Targets under a NEW SubGoal
//      ('Auto-migrated from orphaned link'), which the Goals tab does not read.
// Trace back: Target -> SubGoal -> goal-named ParentGoal -> Program(name = original
// skill area title) -> original ParentGoal with that title.
//
// Dry run by default; --apply writes. --client <id> limits to one client.
// Writes a JSON backup of every row it will touch before changing anything.
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import fs from "node:fs";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const clientArgIdx = process.argv.indexOf("--client");
const ONLY_CLIENT = clientArgIdx > -1 ? process.argv[clientArgIdx + 1] : null;

const AUTO_SKILL = "Auto-created skill area for:";
const AUTO_SUB = "Auto-migrated from orphaned link";
const AUTO_PROG = "Created from ParentGoal";
const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const targets = await prisma.target.findMany({
    where: { subGoal: { description: AUTO_SUB }, ...(ONLY_CLIENT ? { subGoal: { description: AUTO_SUB, parentGoal: { clientId: ONLY_CLIENT } } } : {}) },
    include: { subGoal: { include: { parentGoal: { include: { program: true } } } } },
  });

  const plan = [];
  const unresolved = [];
  const skillCache = new Map();

  const isAutoProgram = (p) => (p?.description ?? "").startsWith(AUTO_PROG);
  const newSkillFor = new Map(); // programId -> placeholder plan entry for a skill area named after the category

  for (const t of targets) {
    const autoSkill = t.subGoal.parentGoal;
    const program = autoSkill.program;
    const clientId = autoSkill.clientId;

    // fix_final also wrapped goals that were ALREADY in a real skill area: just put them back.
    if (!(autoSkill.description ?? "").startsWith(AUTO_SKILL)) {
      plan.push({ targetId: t.id, def: t.definition, to: autoSkill, kind: "back" });
      continue;
    }
    if (!program) { unresolved.push({ t, why: "auto skill area has no program" }); continue; }

    const key = `${clientId}|${norm(program.name)}`;
    if (!skillCache.has(key)) {
      const candidates = await prisma.parentGoal.findMany({
        where: { clientId, status: { not: "ARCHIVED" } },
        include: { program: true },
        orderBy: { createdAt: "asc" },
      });
      // Filtered in JS: a Prisma NOT startsWith also drops rows whose description is NULL.
      let m = candidates.filter((c) =>
        !(c.description ?? "").startsWith(AUTO_SKILL) && norm(c.title) === norm(program.name));
      if (m.length > 1) {
        const real = m.filter((c) => c.program && c.program.isActive && !isAutoProgram(c.program));
        if (real.length) m = real;
      }
      skillCache.set(key, m);
    }
    const matches = skillCache.get(key);

    if (matches.length >= 1) {
      plan.push({ targetId: t.id, def: t.definition, to: matches[0], kind: matches.length > 1 ? "earliest of dupes" : "traced" });
    } else if (!isAutoProgram(program) && program.clientId === clientId) {
      // The goal sat directly on a real category: give it a skill area named after the category.
      if (!newSkillFor.has(program.id)) newSkillFor.set(program.id, { id: null, title: program.name, clientId, programId: program.id, program });
      plan.push({ targetId: t.id, def: t.definition, to: newSkillFor.get(program.id), kind: "new skill area" });
    } else {
      unresolved.push({ t, program, why: "no original skill area with that title" });
    }
  }

  const clients = new Map((await prisma.client.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));

  console.log(`Targets traced: ${targets.length}`);
  console.log(`Resolvable:     ${plan.length}`);
  console.log(`Unresolved:     ${unresolved.length}\n`);

  const byClient = {};
  for (const p of plan) (byClient[clients.get(p.to.clientId)] ??= []).push(p);
  for (const [name, rows] of Object.entries(byClient)) {
    console.log(`== ${name} (${rows.length})`);
    for (const r of rows.slice(0, 50)) {
      console.log(`  [${r.to.program?.name ?? "NO CATEGORY"} > ${r.to.title}] (${r.kind})  ${r.def.slice(0, 60)}`);
    }
  }
  if (unresolved.length) {
    console.log(`\n== UNRESOLVED`);
    for (const u of unresolved) {
      console.log(`  ${clients.get(u.t.subGoal.parentGoal.clientId)} | via "${u.program?.name}" | ${u.why} | ${u.t.definition.slice(0, 60)}`);
    }
  }

  if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); return; }

  const touchedSubIds = [...new Set(targets.map((t) => t.subGoalId))];
  const touchedSkillIds = [...new Set(targets.map((t) => t.subGoal.parentGoalId))];
  const autoPrograms = await prisma.program.findMany({
    where: { description: { startsWith: AUTO_PROG }, ...(ONLY_CLIENT ? { clientId: ONLY_CLIENT } : {}) },
  });
  const backup = {
    at: new Date().toISOString(),
    targets: targets.map(({ subGoal, ...t }) => t),
    subGoals: await prisma.subGoal.findMany({ where: { id: { in: touchedSubIds } } }),
    autoSkillAreas: await prisma.parentGoal.findMany({ where: { id: { in: touchedSkillIds } } }),
    autoPrograms,
  };
  const file = `/root/restore-skill-areas-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`\nBackup written: ${file}`);

  await prisma.$transaction(async (tx) => {
    for (const ns of newSkillFor.values()) {
      const created = await tx.parentGoal.create({
        data: { clientId: ns.clientId, programId: ns.programId, title: ns.title, status: "ACTIVE" },
      });
      ns.id = created.id;
    }
    for (const p of plan) {
      await tx.target.update({ where: { id: p.targetId }, data: { parentGoalId: p.to.id, subGoalId: null, programId: null } });
    }
  }, { timeout: 120000 });
  console.log(`Re-linked ${plan.length} goals (created ${newSkillFor.size} skill areas named after their category).`);

  // Soft, reversible cleanup of the now-empty scaffolding the migrations created.
  const emptySubs = await prisma.subGoal.findMany({ where: { id: { in: touchedSubIds }, targets: { none: {} } }, select: { id: true } });
  await prisma.subGoal.updateMany({ where: { id: { in: emptySubs.map((s) => s.id) } }, data: { status: "ARCHIVED" } });
  const emptySkills = await prisma.parentGoal.findMany({
    where: {
      id: { in: touchedSkillIds },
      description: { startsWith: AUTO_SKILL },
      targets: { none: {} },
      subGoals: { none: { status: { not: "ARCHIVED" } } },
    },
    select: { id: true },
  });
  await prisma.parentGoal.updateMany({ where: { id: { in: emptySkills.map((s) => s.id) } }, data: { status: "ARCHIVED" } });
  const emptyProgIds = [];
  for (const p of autoPrograms) {
    if (!p.isActive) continue;
    const liveSkills = await prisma.parentGoal.count({ where: { programId: p.id, status: { not: "ARCHIVED" } } });
    const liveTargets = await prisma.target.count({ where: { programId: p.id, isActive: true } });
    if (liveSkills === 0 && liveTargets === 0) emptyProgIds.push(p.id);
  }
  await prisma.program.updateMany({ where: { id: { in: emptyProgIds } }, data: { isActive: false } });
  console.log(`Archived ${emptySubs.length} empty sub-goals, ${emptySkills.length} goal-named skill areas, ${emptyProgIds.length} fake categories.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
