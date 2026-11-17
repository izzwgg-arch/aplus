import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();

async function fixClientGoals(client) {
  console.log(`\n📋 Fixing ${client.name}...`);

  // Get all PROGRAM-DIRECT targets (broken state: programId set but subGoalId null)
  const brokenGoals = await prisma.target.findMany({
    where: {
      program: { clientId: client.id },
      programId: { not: null },
      subGoalId: null,  // This is the broken state
      isActive: true,
    },
    include: { program: { select: { id: true, name: true, clientId: true } } },
  });

  if (brokenGoals.length === 0) {
    console.log("  ✓ No broken goals");
    return 0;
  }

  let fixed = 0;

  for (const goal of brokenGoals) {
    // Create a ParentGoal (skill area) under this Program
    const skillArea = await prisma.parentGoal.create({
      data: {
        clientId: goal.program.clientId,
        programId: goal.programId,
        title: goal.definition.substring(0, 100), // Use goal definition as skill area name
        description: `Auto-created skill area for: ${goal.definition}`,
      },
    });

    // Link the goal to the ParentGoal (skill area)
    await prisma.target.update({
      where: { id: goal.id },
      data: {
        parentGoalId: skillArea.id,
        programId: null, // Remove the legacy direct Program link
      },
    });

    fixed++;
  }

  console.log(`  ✅ Fixed ${fixed} goals by creating skill areas`);
  return fixed;
}

async function main() {
  console.log("🔧 Fixing goal hierarchy (Program → SubGoal → Target)\n");

  const clients = await prisma.client.findMany({
    where: { isArchived: false },
    select: { id: true, name: true },
  });

  let totalFixed = 0;

  for (const client of clients) {
    totalFixed += await fixClientGoals(client);
  }

  console.log(`\n✨ Fixed ${totalFixed} total goals`);
  console.log("Goals now have proper hierarchy: Program → Skill Area → Goal");

  await prisma.$disconnect();
}

main().catch(console.error);
