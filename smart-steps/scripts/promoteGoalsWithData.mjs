// Promote every goal (Target) that has collected trial data but is still
// phase NEW to ACQUISITION ("In Treatment").
//
// Why these exist: the NEW -> ACQUISITION promotion used to be a
// fire-and-forget PATCH from the browser, which silently failed for BTs
// without targets.edit (and on any network hiccup). The server now promotes
// on every trial write (src/lib/targetPromotion.ts); this script backfills
// the goals left behind.
//
// Only live trials count (trial.deletedAt null — a soft-deleted session
// stamps its trials). Only NEW goals are touched: BASELINE / MAINTENANCE /
// GENERALIZATION / MASTERED are deliberate clinical states.
//
// Dry run by default. Run from smart-steps/ with:
//   node --env-file=.env.local scripts/promoteGoalsWithData.mjs           # report only
//   node --env-file=.env.local scripts/promoteGoalsWithData.mjs --apply   # write
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const candidates = await prisma.target.findMany({
    where: {
      phase: "NEW",
      trials: { some: { deletedAt: null } },
    },
    select: {
      id: true,
      definition: true,
      _count: { select: { trials: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${candidates.length} NEW goal(s) with live trial data:`);
  for (const t of candidates) {
    console.log(`  ${t.id}  (${t._count.trials} trials)  ${t.definition.slice(0, 80)}`);
  }

  if (candidates.length === 0) return;

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to promote these to ACQUISITION.");
    return;
  }

  const res = await prisma.target.updateMany({
    where: { id: { in: candidates.map((t) => t.id) }, phase: "NEW" },
    data: { phase: "ACQUISITION" },
  });
  console.log(`\nPromoted ${res.count} goal(s) to ACQUISITION (In Treatment).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
