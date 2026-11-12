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

async function findOrCreateProgram(parentGoalTitle, clientId) {
  // Try to find exact match
  const normalized = normalizeLabel(parentGoalTitle);

  const existing = await prisma.program.findFirst({
    where: {
      clientId,
      name: { in: [] }, // Will check manually
    },
  });

  // Manual normalization check
  const allPrograms = await prisma.program.findMany({
    where: { clientId },
    select: { id: true, name: true },
  });

  for (const prog of allPrograms) {
    if (normalizeLabel(prog.name) === normalized) {
      return prog;
    }
  }

  // Create new program with ParentGoal title
  const newProgram = await prisma.program.create({
    data: {
      clientId,
      name: parentGoalTitle,
      domain: "General", // Default domain
      description: `Created from ParentGoal "${parentGoalTitle}"`,
    },
  });

  return newProgram;
}

async function migrateClientGoals(client) {
  console.log(`\n📋 ${client.name}:`);

  // Get all parent goals with targets for this client
  const parentGoals = await prisma.parentGoal.findMany({
    where: { clientId: client.id, targets: { some: {} } },
    include: { targets: { select: { id: true } } },
  });

  if (parentGoals.length === 0) {
    console.log("  ✓ No parent goals with targets");
    return { migrated: 0, created: 0 };
  }

  let migratedCount = 0;
  let createdCount = 0;

  for (const pg of parentGoals) {
    // Find or create program
    const program = await findOrCreateProgram(pg.title, client.id);

    if (program.description?.includes("Created from ParentGoal")) {
      createdCount++;
      console.log(`  ✨ Created Program: "${pg.title}" (${pg.targets.length} targets)`);
    } else {
      console.log(`  ✓ Using existing Program: "${program.name}" (${pg.targets.length} targets)`);
    }

    // Move all targets
    const result = await prisma.target.updateMany({
      where: { parentGoalId: pg.id },
      data: {
        programId: program.id,
        parentGoalId: null, // DELINK
      },
    });

    migratedCount += result.count;
  }

  return { migrated: migratedCount, created: createdCount };
}

async function main() {
  console.log("🔄 Complete ParentGoal → Program migration...\n");
  console.log("This will:");
  console.log("  1. Move ALL targets from ParentGoals to Programs");
  console.log("  2. Create new Programs where needed");
  console.log("  3. Delink parentGoalId completely\n");

  const clients = await prisma.client.findMany({
    where: { isArchived: false },
    select: { id: true, name: true },
  });

  let totalMigrated = 0;
  let totalCreated = 0;

  for (const client of clients) {
    const { migrated, created } = await migrateClientGoals(client);
    totalMigrated += migrated;
    totalCreated += created;
  }

  console.log(`\n✨ Migration complete!`);
  console.log(`   Total targets moved: ${totalMigrated}`);
  console.log(`   New Programs created: ${totalCreated}`);
  console.log(`\n✅ ParentGoals are now completely delinked!`);
  console.log(`   Regular goals are now in the Program hierarchy`);
  console.log(`   ParentGoals are ready for BCBA parent training notes only`);

  await prisma.$disconnect();
}

main().catch(console.error);
