import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();

const issues = [];

async function auditClient(client) {
  // Fetch all targets for this client
  const allTargets = await prisma.target.findMany({
    where: {
      OR: [
        { parentGoal: { clientId: client.id } },
        { subGoal: { parentGoal: { clientId: client.id } } },
        { program: { clientId: client.id } },
      ],
      isActive: true,
    },
    include: {
      parentGoal: { select: { id: true, title: true } },
      subGoal: { select: { id: true, parentGoal: { select: { id: true } } } },
      program: { select: { id: true, name: true } },
    },
  });

  if (allTargets.length === 0) return; // No goals to check

  // Count by linking type
  const byType = {};
  allTargets.forEach((t) => {
    if (t.parentGoalId && !t.subGoalId) byType["direct-parent"] = (byType["direct-parent"] || 0) + 1;
    else if (t.subGoalId) byType["sub-goal"] = (byType["sub-goal"] || 0) + 1;
    else if (t.programId) byType["program-direct"] = (byType["program-direct"] || 0) + 1;
    else byType["orphan"] = (byType["orphan"] || 0) + 1;
  });

  // Check for anomalies
  const phaseCount = {};
  allTargets.forEach((t) => {
    phaseCount[t.phase] = (phaseCount[t.phase] || 0) + 1;
  });

  // Check for orphans
  const orphans = allTargets.filter(
    (t) => !t.parentGoalId && !t.subGoalId && !t.programId
  );

  // Report if anything unusual
  const hasDirectParent = byType["direct-parent"] > 0;
  const hasManyNew = phaseCount["NEW"] > 5;
  const hasOrphans = orphans.length > 0;

  if (hasDirectParent || hasManyNew || hasOrphans) {
    issues.push({
      clientName: client.name,
      clientId: client.id,
      totalGoals: allTargets.length,
      byLinkType: byType,
      phaseCount,
      orphanCount: orphans.length,
      flags: [
        hasDirectParent ? "⚠️  Has direct-parent links (non-standard)" : null,
        hasManyNew ? `⚠️  Has ${phaseCount["NEW"]} NEW goals (high count)` : null,
        hasOrphans ? `🚨 Has ${orphans.length} orphan goals` : null,
      ].filter(Boolean),
    });
  }
}

async function main() {
  console.log("🔍 Auditing all clients for goal visibility issues...\n");

  const clients = await prisma.client.findMany({
    where: { isArchived: false },
    select: { id: true, name: true },
  });

  console.log(`Found ${clients.length} active clients\n`);

  for (const client of clients) {
    await auditClient(client);
  }

  if (issues.length === 0) {
    console.log("✅ All clients have standard goal structures. No issues found!\n");
  } else {
    console.log(`⚠️  Found ${issues.length} clients with potential issues:\n`);
    issues.forEach((issue) => {
      console.log(`📋 ${issue.clientName} (${issue.clientId})`);
      console.log(`   Total goals: ${issue.totalGoals}`);
      console.log(`   Link types: ${JSON.stringify(issue.byLinkType)}`);
      console.log(`   Phases: ${JSON.stringify(issue.phaseCount)}`);
      issue.flags.forEach((flag) => console.log(`   ${flag}`));
      console.log();
    });
  }

  console.log("\n📊 Summary:");
  console.log(`  Clients audited: ${clients.length}`);
  console.log(`  Clients with issues: ${issues.length}`);
  console.log(
    `  Direct-parent link patterns (non-standard): ${issues.filter((i) => i.byLinkType["direct-parent"]).length}`
  );
  console.log(`  Orphan goals found: ${issues.reduce((sum, i) => sum + i.orphanCount, 0)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
