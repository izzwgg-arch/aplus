import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();

async function fixTargets() {
  console.log("🔧 Fixing corrupted target links (ParentGoal→Program remapping)...\n");

  // Get all targets with parentGoalId but no programId
  const corrupted = await prisma.target.findMany({
    where: { parentGoalId: { not: null }, programId: null },
    include: { parentGoal: { select: { clientId: true, title: true } } },
  });

  console.log(`Found ${corrupted.length} corrupted targets\n`);

  // Group by client and build mapping
  const byClient = {};
  for (const target of corrupted) {
    const cid = target.parentGoal.clientId;
    if (!byClient[cid]) byClient[cid] = {};
    byClient[cid][target.parentGoalId] = true;
  }

  let totalFixed = 0;

  for (const clientId of Object.keys(byClient)) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true },
    });

    console.log(`📋 ${client.name}:`);

    // Get programs and parentGoals for this client
    const programs = await prisma.program.findMany({
      where: { clientId },
      select: { id: true, name: true },
    });

    const parentGoals = await prisma.parentGoal.findMany({
      where: { clientId },
      select: { id: true, title: true },
    });

    // Map ParentGoals to Programs
    for (const pg of parentGoals) {
      const match = programs.find(
        (p) =>
          p.name.toLowerCase() === pg.title.toLowerCase() ||
          pg.title.toLowerCase().includes(p.name.toLowerCase())
      );

      if (match) {
        const result = await prisma.target.updateMany({
          where: { parentGoalId: pg.id, programId: null },
          data: { programId: match.id, parentGoalId: null },
        });

        if (result.count > 0) {
          console.log(`  ✓ ${pg.title} → ${match.name} (${result.count} targets)`);
          totalFixed += result.count;
        }
      } else {
        console.log(`  ⚠️  ${pg.title} → (no matching program)`);
      }
    }
    console.log();
  }

  console.log(`✨ Fixed ${totalFixed} total targets!`);
  await prisma.$disconnect();
}

fixTargets().catch(console.error);
