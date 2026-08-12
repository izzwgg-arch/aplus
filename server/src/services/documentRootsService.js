import { prisma } from "../config/prisma.js";

/**
 * The six default folders that must exist at the root of every client's Files area.
 * section = the shortcut key used in ClientDocumentRoot
 * folderName = the actual folder name that appears in the file manager
 */
export const DEFAULT_FOLDERS = [
  { section: "bba",               folderName: "Brain Balance Assessment" },
  { section: "bbr",               folderName: "Brain Balance Report" },
  { section: "ctr",               folderName: "Client Treatment Report" },
  { section: "supplements",       folderName: "Supplements" },
  { section: "registration_form", folderName: "Registration Form" },
  { section: "assessments",       folderName: "Assessments" },
];

/**
 * Ensure every default folder exists inside the client's Files root.
 *
 * For each required folder:
 *  1. If a ClientDocumentRoot already points to a non-deleted folder → skip.
 *  2. If a root-level folder with that name already exists in ClientFile → wire it.
 *  3. Otherwise → create the folder then wire it.
 *
 * Idempotent: safe to call multiple times.
 *
 * @param {string} clientId
 */
export async function ensureClientDefaultFolders(clientId) {
  // Fetch all existing roots for this client in one query
  const existingRoots = await prisma.clientDocumentRoot.findMany({
    where: { clientId },
  });
  const rootMap = new Map(existingRoots.map((r) => [r.section, r]));

  // Fetch all root-level (parentId=null) folders in "files" section for this client
  const existingFolders = await prisma.clientFile.findMany({
    where: {
      clientId,
      section: "files",
      type: "FOLDER",
      parentId: null,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  // Build a case-insensitive name map: lowercase name → id
  const folderByName = new Map(existingFolders.map((f) => [f.name.toLowerCase(), f.id]));

  for (const { section, folderName } of DEFAULT_FOLDERS) {
    const root = rootMap.get(section);

    // If root points to a live folder, nothing to do
    if (root?.folderId) {
      const live = await prisma.clientFile.findFirst({
        where: { id: root.folderId, deletedAt: null },
        select: { id: true },
      });
      if (live) continue;
    }

    // Find or create the actual folder record
    let folderId = folderByName.get(folderName.toLowerCase());

    if (!folderId) {
      const created = await prisma.clientFile.create({
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
      folderId = created.id;
      folderByName.set(folderName.toLowerCase(), folderId);
    }

    // Upsert the ClientDocumentRoot record to record the folder ID
    await prisma.clientDocumentRoot.upsert({
      where:  { clientId_section: { clientId, section } },
      create: { clientId, section, folderName, folderId },
      update: { folderId },
    });
  }
}

/**
 * Returns a map of { section → folderId } for a client.
 * Calls ensureClientDefaultFolders first if any are missing.
 *
 * @param {string} clientId
 * @returns {Promise<Record<string, string>>}
 */
export async function getClientFolderIds(clientId) {
  let roots = await prisma.clientDocumentRoot.findMany({
    where: { clientId },
    select: { section: true, folderId: true },
  });

  const missing = DEFAULT_FOLDERS.some(
    (df) => !roots.find((r) => r.section === df.section && r.folderId)
  );

  if (missing) {
    await ensureClientDefaultFolders(clientId);
    roots = await prisma.clientDocumentRoot.findMany({
      where: { clientId },
      select: { section: true, folderId: true },
    });
  }

  const map = {};
  for (const r of roots) {
    if (r.folderId) map[r.section] = r.folderId;
  }
  return map;
}
