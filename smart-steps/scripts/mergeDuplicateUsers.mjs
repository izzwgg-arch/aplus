#!/usr/bin/env node
/**
 * Merge duplicate User rows that refer to the same person.
 *
 * Why duplicates exist: staff profiles created via Settings → Staff get a cuid
 * id, while SSO logins from A+ Center arrive under the main app's user id.
 * Before the ensureUser email-linking fix, an SSO login could create a second
 * (empty) row for the same email — with different casing — leaving the
 * person's client assignments on one row and their live session on the other,
 * so assigned clients never appeared for them.
 *
 * What this does, per group of users sharing the same lowercased email:
 *   1. Picks a keeper: the row with a local password, else the row with the
 *      most client assignments, else the oldest row.
 *   2. Moves every FK reference (assignments, sessions, notes, audit entries,
 *      assessments, annotations, reset tokens, goal usage/favorites) from the
 *      duplicates onto the keeper, deduping where unique constraints apply.
 *   3. Deletes the duplicate rows.
 * Finally it lowercases every remaining User.email so future exact-match
 * lookups (local login, staff creation) behave consistently.
 *
 * Dry run (default — safe, read-only):
 *   node --env-file=.env.local scripts/mergeDuplicateUsers.mjs
 *
 * Apply mode (writes to DB — only run after reviewing dry-run output):
 *   node --env-file=.env.local scripts/mergeDuplicateUsers.mjs --apply
 */

import { PrismaClient } from "@prisma/client";

const applyMode = process.argv.includes("--apply");
const prisma = new PrismaClient();

async function main() {
  console.log(
    `\n=== Duplicate User merge — ${applyMode ? "APPLY MODE" : "DRY RUN (no writes)"} ===\n`,
  );

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      appRoleId: true,
      passwordHash: true,
      createdAt: true,
      _count: { select: { assignedClients: true, sessions: true, notes: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map();
  for (const u of users) {
    const key = u.email.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }

  const dupGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
  console.log(`Total users: ${users.length}; emails with duplicates: ${dupGroups.length}`);

  const placeholders = users.filter((u) => u.email.startsWith("sso-") && u.email.endsWith("@smart-steps.local"));
  if (placeholders.length > 0) {
    console.log(`\nNOTE: ${placeholders.length} placeholder account(s) (sso-*@smart-steps.local) cannot be`);
    console.log("matched by email automatically — review these manually:");
    for (const p of placeholders) {
      console.log(`  - ${p.id} name="${p.name}" assignments=${p._count.assignedClients} sessions=${p._count.sessions}`);
    }
  }

  for (const [email, list] of dupGroups) {
    // Keeper: local-password row wins (it's the one the person can actually
    // log into standalone), then most assignments, then oldest.
    const sorted = [...list].sort((a, b) => {
      if (!!b.passwordHash !== !!a.passwordHash) return b.passwordHash ? 1 : -1;
      if (b._count.assignedClients !== a._count.assignedClients) {
        return b._count.assignedClients - a._count.assignedClients;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keeper = sorted[0];
    const dupes = sorted.slice(1);

    console.log(`\n${email}:`);
    console.log(
      `  KEEP  ${keeper.id} name="${keeper.name}" role=${keeper.role} local-pw=${!!keeper.passwordHash} assignments=${keeper._count.assignedClients} sessions=${keeper._count.sessions}`,
    );
    for (const d of dupes) {
      console.log(
        `  MERGE ${d.id} name="${d.name}" role=${d.role} local-pw=${!!d.passwordHash} assignments=${d._count.assignedClients} sessions=${d._count.sessions}`,
      );
    }

    if (!applyMode) continue;

    for (const dupe of dupes) {
      await prisma.$transaction(async (tx) => {
        // ClientAssignment has @@unique([clientId, userId]) — drop the dupe's
        // assignment where the keeper already has one for that client.
        const keeperAssignments = await tx.clientAssignment.findMany({
          where: { userId: keeper.id },
          select: { clientId: true },
        });
        const keeperClientIds = new Set(keeperAssignments.map((a) => a.clientId));
        const dupeAssignments = await tx.clientAssignment.findMany({
          where: { userId: dupe.id },
          select: { id: true, clientId: true },
        });
        for (const a of dupeAssignments) {
          if (keeperClientIds.has(a.clientId)) {
            await tx.clientAssignment.delete({ where: { id: a.id } });
          } else {
            await tx.clientAssignment.update({ where: { id: a.id }, data: { userId: keeper.id } });
          }
        }

        await tx.session.updateMany({ where: { userId: dupe.id }, data: { userId: keeper.id } });
        await tx.note.updateMany({ where: { userId: dupe.id }, data: { userId: keeper.id } });
        await tx.auditEntry.updateMany({ where: { userId: dupe.id }, data: { userId: keeper.id } });
        await tx.clientAssessment.updateMany({
          where: { completedById: dupe.id },
          data: { completedById: keeper.id },
        });
        await tx.targetAnnotation.updateMany({ where: { userId: dupe.id }, data: { userId: keeper.id } });
        await tx.passwordResetToken.updateMany({ where: { userId: dupe.id }, data: { userId: keeper.id } });
        await tx.goalLibraryUsage.updateMany({ where: { userId: dupe.id }, data: { userId: keeper.id } });

        // UserGoalFavorite has @@unique([userId, goalItemId]) and
        // @@unique([userId, parentItemId]) — dedupe against the keeper's rows.
        const keeperFavs = await tx.userGoalFavorite.findMany({
          where: { userId: keeper.id },
          select: { goalItemId: true, parentItemId: true },
        });
        const keeperGoalFavs = new Set(keeperFavs.map((f) => f.goalItemId).filter(Boolean));
        const keeperParentFavs = new Set(keeperFavs.map((f) => f.parentItemId).filter(Boolean));
        const dupeFavs = await tx.userGoalFavorite.findMany({
          where: { userId: dupe.id },
          select: { id: true, goalItemId: true, parentItemId: true },
        });
        for (const f of dupeFavs) {
          const clash =
            (f.goalItemId && keeperGoalFavs.has(f.goalItemId)) ||
            (f.parentItemId && keeperParentFavs.has(f.parentItemId));
          if (clash) {
            await tx.userGoalFavorite.delete({ where: { id: f.id } });
          } else {
            await tx.userGoalFavorite.update({ where: { id: f.id }, data: { userId: keeper.id } });
          }
        }

        await tx.user.delete({ where: { id: dupe.id } });
      });
      console.log(`  merged ${dupe.id} -> ${keeper.id}`);
    }
  }

  // Normalize email casing on all surviving rows (safe post-merge: any two
  // rows differing only by case were a duplicate group and are now one row).
  const survivors = await prisma.user.findMany({ select: { id: true, email: true } });
  const toLower = survivors.filter((u) => u.email !== u.email.trim().toLowerCase());
  console.log(`\nEmails needing lowercase normalization: ${toLower.length}`);
  for (const u of toLower) {
    console.log(`  ${u.email} -> ${u.email.trim().toLowerCase()}`);
    if (applyMode) {
      await prisma.user.update({ where: { id: u.id }, data: { email: u.email.trim().toLowerCase() } });
    }
  }

  console.log(`\nDone${applyMode ? "" : " (dry run — re-run with --apply to write)"}.\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
