import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();

function normalizeLabel(text) {
  return (text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function findBestMatchingProgram(parentGoalTitle, programs) {
  const normalized = normalizeLabel(parentGoalTitle);

  // Pre-normalize all programs
  const normalizedPrograms = programs.map((p) => ({
    id: p.id,
    name: p.name,
    normalizedName: normalizeLabel(p.name),
  }));

  // Exact match
  const exact = normalizedPrograms.find(
    (p) => p.normalizedName === normalized
  );
  if (exact) return { id: exact.id, name: exact.name };

  // Contains match (parent goal in program name or vice versa)
  const contains = normalizedPrograms.find((p) =>
    p.normalizedName.includes(normalized) || normalized.includes(p.normalizedName)
  );
  if (contains) return { id: contains.id, name: contains.name };

  // No match found
  return null;
}

async function migrateClientGoals(client) {
  console.log(`\n📋 ${client.name}:`);

  // Get all programs for this client
  const programs = await prisma.program.findMany({
    where: { clientId: client.id },
    select: { id: true, name: true },
  });

  // Get all parent goals with targets for this client
  const parentGoals = await prisma.parentGoal.findMany({
    where: { clientId: client.id, targets: { some: {} } },
    include: { targets: { select: { id: true, definition: true } } },
  });

  if (parentGoals.length === 0) {
    console.log("  ✓ No parent goals with targets");
    return 0;
  }

  let migratedCount = 0;

  for (const pg of parentGoals) {
    const match = await findBestMatchingProgram(pg.title, programs);

    if (match) {
      // Move all targets from this parent goal to the program
      const result = await prisma.target.updateMany({
        where: { parentGoalId: pg.id },
        data: {
          programId: match.id,
          parentGoalId: null,
        },
      });

      console.log(`  ✓ "${pg.title}" → "${match.name}" (${result.count} targets)`);
      migratedCount += result.count;
    } else {
      console.log(`  ⚠️  "${pg.title}" → (no matching program, ${pg.targets.length} targets)`);
      console.log(`      Examples: ${pg.targets.slice(0, 2).map(t => t.definition.substring(0, 40)).join(", ")}`);
    }
  }

  return migratedCount;
}

async function main() {
  console.log("🔄 Migrating ParentGoal targets to Programs...\n");

  const clients = await prisma.client.findMany({
    where: { isArchived: false },
    select: { id: true, name: true },
  });

  let totalMigrated = 0;

  for (const client of clients) {
    const count = await migrateClientGoals(client);
    totalMigrated += count;
  }

  console.log(`\n✨ Migration complete!`);
  console.log(`   Total targets migrated: ${totalMigrated}`);

  await prisma.$disconnect();
}

main().catch(console.error);
