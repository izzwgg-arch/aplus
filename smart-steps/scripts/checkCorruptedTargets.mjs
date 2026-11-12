import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();

async function check() {
  const usher = await prisma.client.findFirst({
    where: { name: { contains: "Usher" } },
  });

  if (!usher) {
    console.log("Usher not found");
    process.exit(0);
  }

  console.log("Checking Usher Jakubowicz targets...\n");

  // Check targets linked to parentGoalId (wrong - should be programId)
  const corrupted = await prisma.target.findMany({
    where: {
      parentGoal: { clientId: usher.id },
      programId: null,
    },
    take: 5,
    select: {
      id: true,
      definition: true,
      parentGoalId: true,
      programId: true,
      parentGoal: { select: { title: true, domain: true } },
    },
  });

  console.log(`Found ${corrupted.length} targets linked to ParentGoals (WRONG):`);
  corrupted.forEach((t) => {
    console.log(`  ❌ ${t.definition.substring(0, 60)}`);
    console.log(`     → Linked to ParentGoal: "${t.parentGoal?.title}"`);
    console.log(`     → programId: ${t.programId}`);
  });

  // Check targets correctly linked to Programs
  const correct = await prisma.target.findMany({
    where: {
      parentGoal: { clientId: usher.id },
      programId: { not: null },
    },
    take: 3,
  });

  console.log(`\nFound ${correct.length} targets correctly linked to Programs`);

  await prisma.$disconnect();
}

check().catch(console.error);
