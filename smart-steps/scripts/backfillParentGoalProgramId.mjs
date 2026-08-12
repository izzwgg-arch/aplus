#!/usr/bin/env node
/**
 * Backfill ParentGoal.programId for rows where it is NULL.
 *
 * Match strategy: same clientId + ParentGoal.domain (case-insensitive) = Program.name
 * The SkillAreaModal always sent `domain: category.name` in the POST body, so this
 * is the reliable link even without an explicit FK.
 *
 * Dry run (default — safe, read-only):
 *   node --env-file=.env.local scripts/backfillParentGoalProgramId.mjs
 *
 * Apply mode (writes to DB — only run after reviewing dry-run output):
 *   node --env-file=.env.local scripts/backfillParentGoalProgramId.mjs --apply
 *
 * The script never deletes records and never updates ambiguous rows.
 */

import { PrismaClient } from "@prisma/client";

const applyMode = process.argv.includes("--apply");

const prisma = new PrismaClient();

async function main() {
  console.log(
    `\n=== ParentGoal.programId backfill — ${applyMode ? "APPLY MODE" : "DRY RUN (no writes)"} ===\n`,
  );

  // ── 1. Load all ParentGoals with programId = NULL ─────────────────────────
  const nullGoals = await prisma.parentGoal.findMany({
    where: { programId: null, status: { not: "ARCHIVED" } },
    select: { id: true, title: true, domain: true, clientId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total active ParentGoal rows with programId = NULL : ${nullGoals.length}`);

  if (nullGoals.length === 0) {
    console.log("Nothing to backfill — all rows already have programId set.\n");
    return;
  }

  // ── 2. Load all active Programs ───────────────────────────────────────────
  const programs = await prisma.program.findMany({
    where: { isActive: true },
    select: { id: true, clientId: true, name: true },
  });

  // Build lookup: "clientId:nameLower" → Program[]
  const lookup = new Map();
  for (const p of programs) {
    const key = `${p.clientId}:${p.name.toLowerCase().trim()}`;
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push(p);
  }

  // ── 3. Categorise each null row ───────────────────────────────────────────
  const matched   = []; // exactly one Program candidate → safe to update
  const ambiguous = []; // multiple Programs with same name for this client → skip
  const unmatched = []; // no Program found → skip

  for (const goal of nullGoals) {
    if (!goal.domain) {
      unmatched.push({ goal, reason: "no domain value" });
      continue;
    }
    const key = `${goal.clientId}:${goal.domain.toLowerCase().trim()}`;
    const candidates = lookup.get(key) ?? [];

    if (candidates.length === 1) {
      matched.push({ goal, program: candidates[0] });
    } else if (candidates.length > 1) {
      ambiguous.push({ goal, candidates });
    } else {
      unmatched.push({ goal, reason: `no active Program with name matching "${goal.domain}"` });
    }
  }

  // ── 4. Print summary ──────────────────────────────────────────────────────
  console.log(`  Matched (would update) : ${matched.length}`);
  console.log(`  Ambiguous (skipped)    : ${ambiguous.length}`);
  console.log(`  Unmatched (skipped)    : ${unmatched.length}\n`);

  if (matched.length > 0) {
    console.log("--- Matched rows ---");
    for (const { goal, program } of matched) {
      console.log(
        `  [MATCH] "${goal.title}" (${goal.id})\n` +
        `          domain="${goal.domain}" → Program "${program.name}" (${program.id})`,
      );
    }
    console.log();
  }

  if (ambiguous.length > 0) {
    console.log("--- Ambiguous rows (multiple Programs share the same name — SKIPPED) ---");
    for (const { goal, candidates } of ambiguous) {
      console.log(`  [SKIP] "${goal.title}" (${goal.id}), domain="${goal.domain}"`);
      for (const c of candidates) {
        console.log(`         candidate Program: "${c.name}" (${c.id})`);
      }
    }
    console.log(
      "\n  Action required: remove duplicate Program rows for the ambiguous clients,\n" +
      "  then re-run this script.\n",
    );
  }

  if (unmatched.length > 0) {
    console.log("--- Unmatched rows (no Program found — SKIPPED) ---");
    for (const { goal, reason } of unmatched) {
      console.log(`  [SKIP] "${goal.title}" (${goal.id}): ${reason}`);
    }
    console.log();
  }

  // ── 5. Apply (only when --apply flag is present) ──────────────────────────
  if (!applyMode) {
    console.log("DRY RUN complete — no changes written to the database.");
    console.log("Re-run with --apply to write the matched updates.\n");
    return;
  }

  if (matched.length === 0) {
    console.log("No matched rows to update.\n");
    return;
  }

  console.log(`Applying ${matched.length} update(s)...`);
  let updated = 0;
  for (const { goal, program } of matched) {
    await prisma.parentGoal.update({
      where: { id: goal.id },
      data:  { programId: program.id },
    });
    updated++;
    console.log(`  Updated "${goal.title}" (${goal.id})  programId → ${program.id}`);
  }
  console.log(`\nDone. ${updated} row(s) updated.\n`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
