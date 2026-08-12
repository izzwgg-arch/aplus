/**
 * Backfill: create real default folders inside every existing client's Files area
 * and wire them to ClientDocumentRoot records.
 *
 * Safe to run multiple times — existing folders are reused, not duplicated.
 *
 * Usage (run from /opt/aba/server or /opt/aba):
 *   node server/src/scripts/backfillDocumentRoots.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_FOLDERS = [
  { section: "bba",               folderName: "Brain Balance Assessment" },
  { section: "bbr",               folderName: "Brain Balance Report" },
  { section: "ctr",               folderName: "Client Treatment Report" },
  { section: "supplements",       folderName: "Supplements" },
  { section: "registration_form", folderName: "Registration Form" },
  { section: "assessments",       folderName: "Assessments" },
];

const BATCH_SIZE = 50;

async function ensureForClient(clientId) {
  // Existing root records
  const existingRoots = await prisma.clientDocumentRoot.findMany({
    where: { clientId },
    select: { section: true, folderId: true },
  });
  const rootMap = new Map(existingRoots.map((r) => [r.section, r.folderId]));

  // Existing root-level folders in "files" section
  const existingFolders = await prisma.clientFile.findMany({
    where: { clientId, section: "files", type: "FOLDER", parentId: null, deletedAt: null },
    select: { id: true, name: true },
  });
  const folderByName = new Map(existingFolders.map((f) => [f.name.toLowerCase(), f.id]));

  let created = 0;
  let wired = 0;

  for (const { section, folderName } of DEFAULT_FOLDERS) {
    const existingFolderId = rootMap.get(section);

    // If root already points to a live folder, skip
    if (existingFolderId) {
      const live = await prisma.clientFile.findFirst({
        where: { id: existingFolderId, deletedAt: null },
        select: { id: true },
      });
      if (live) continue;
    }

    // Find or create the physical folder
    let folderId = folderByName.get(folderName.toLowerCase());

    if (!folderId) {
      const folder = await prisma.clientFile.create({
        data: {
          clientId,
          section: "files",
          type: "FOLDER",
          name: folderName,
          parentId: null,
          uploadedById: null,
        },
        select: { id: true },
      });
      folderId = folder.id;
      folderByName.set(folderName.toLowerCase(), folderId);
      created++;
    } else {
      wired++;
    }

    await prisma.clientDocumentRoot.upsert({
      where:  { clientId_section: { clientId, section } },
      create: { clientId, section, folderName, folderId },
      update: { folderId },
    });
  }

  return { created, wired };
}

async function run() {
  console.log("=== Default Folder Backfill ===");

  const totalClients = await prisma.client.count();
  console.log(`Clients to process: ${totalClients}`);
  console.log(
    `Default folders per client: ${DEFAULT_FOLDERS.map((f) => f.folderName).join(", ")}\n`
  );

  let processed = 0;
  let totalCreated = 0;
  let totalWired = 0;
  let skip = 0;

  while (true) {
    const batch = await prisma.client.findMany({
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      skip,
    });

    if (!batch.length) break;

    for (const { id: clientId } of batch) {
      const { created, wired } = await ensureForClient(clientId);
      totalCreated += created;
      totalWired += wired;
      processed++;
    }

    skip += BATCH_SIZE;
    const pct = Math.round((processed / totalClients) * 100);
    console.log(
      `  ${processed}/${totalClients} (${pct}%) — folders created: ${totalCreated}, wired to existing: ${totalWired}`
    );
  }

  console.log("\n=== Backfill Complete ===");
  console.log(`Clients processed           : ${processed}`);
  console.log(`New folders created         : ${totalCreated}`);
  console.log(`Existing folders wired up   : ${totalWired}`);
  console.log(`Already correct (skipped)   : ${processed * DEFAULT_FOLDERS.length - totalCreated - totalWired}`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
