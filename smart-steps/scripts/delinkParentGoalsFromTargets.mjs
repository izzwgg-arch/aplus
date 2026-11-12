import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();

async function delink() {
  console.log("🔗 Delinking ParentGoals from regular goals...\n");

  // Find all targets with parentGoalId that ALSO have proper hierarchy (subGoalId or programId)
  const toFix = await prisma.target.findMany({
    where: {
      parentGoalId: { not: null },
      OR: [
        { subGoalId: { not: null } },  // Has SubGoal (skill area)
        { programId: { not: null } },  // Has Program (category)
      ],
    },
    select: {
      id: true,
      definition: true,
      parentGoalId: true,
      subGoalId: true,
      programId: true,
    },
  });

  console.log(`Found ${toFix.length} targets with both ParentGoal AND proper hierarchy\n`);

  // Delink all of them
  if (toFix.length > 0) {
    const result = await prisma.target.updateMany({
      where: {
        parentGoalId: { not: null },
        OR: [
          { subGoalId: { not: null } },
          { programId: { not: null } },
        ],
      },
      data: {
        parentGoalId: null,
      },
    });

    console.log(`✅ Delinked ${result.count} targets from ParentGoals\n`);

    // Show what was fixed
    console.log("Examples of delinked goals:");
    toFix.slice(0, 10).forEach((t) => {
      console.log(
        `  • "${t.definition.substring(0, 60)}" ${
          t.subGoalId ? `(SubGoal: ${t.subGoalId})` : `(Program: ${t.programId})`
        }`
      );
    });
  }

  console.log("\n✨ Done! ParentGoals are now delinked from regular goals.");
  await prisma.$disconnect();
}

delink().catch(console.error);
