import express from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { makeClientFileUpload } from "../middleware/upload.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { env } from "../config/env.js";
import { getClientFolderIds } from "../services/documentRootsService.js";

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const uploadDir = path.resolve(env.uploadDir);

const VALID_SECTIONS = new Set(["files", "bba", "bbr", "ctr", "supplements", "registration_form", "assessments"]);

function resolveSection(raw) {
  const s = (raw || "files").toLowerCase().trim();
  return VALID_SECTIONS.has(s) ? s : "files";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function storageUrl(storagePath) {
  if (!storagePath) return null;
  return `/uploads/${storagePath}`;
}

function formatItem(item) {
  return {
    ...item,
    sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
    url: item.storagePath ? storageUrl(item.storagePath) : null,
  };
}

// Build breadcrumb chain: walk up through parent IDs
async function getBreadcrumbs(folderId) {
  if (!folderId) return [];
  const chain = [];
  let current = await prisma.clientFile.findUnique({ where: { id: folderId } });
  while (current) {
    chain.unshift({ id: current.id, name: current.name });
    if (!current.parentId) break;
    current = await prisma.clientFile.findUnique({ where: { id: current.parentId } });
  }
  return chain;
}

// ── GET /api/clients/:clientId/files ─────────────────────────────────────────
// Query params: folderId, search, sort, filter, section
router.get("/", requirePermission("aplus.client_files.view"), async (req, res) => {
  const { clientId } = req.params;
  const { folderId = null, search = "", sort = "name_asc", filter = "all" } = req.query;
  const section = resolveSection(req.query.section);

  const whereBase = {
    clientId,
    section,
    deletedAt: null,
    parentId: folderId || null,
  };

  // Search overrides folder navigation — search entire client+section tree
  const where = search
    ? { clientId, section, deletedAt: null, name: { contains: search, mode: "insensitive" } }
    : whereBase;

  // Type filter
  if (filter === "folders") where.type = "FOLDER";
  else if (filter !== "all") {
    const mimeFilters = {
      pdf:    { mimeType: { contains: "pdf" } },
      image:  { mimeType: { startsWith: "image/" } },
      audio:  { mimeType: { startsWith: "audio/" } },
      video:  { mimeType: { startsWith: "video/" } },
      doc:    { OR: [
        { mimeType: { contains: "word" } },
        { mimeType: { contains: "document" } },
        { extension: { in: ["doc", "docx", "txt", "rtf", "odt"] } },
      ]},
      spreadsheet: { OR: [
        { mimeType: { contains: "sheet" } },
        { mimeType: { contains: "excel" } },
        { mimeType: { contains: "csv" } },
        { extension: { in: ["xls", "xlsx", "csv", "ods"] } },
      ]},
      archive: { OR: [
        { mimeType: { contains: "zip" } },
        { mimeType: { contains: "rar" } },
        { mimeType: { contains: "tar" } },
        { extension: { in: ["zip", "rar", "tar", "gz", "7z"] } },
      ]},
    };
    if (mimeFilters[filter]) Object.assign(where, mimeFilters[filter]);
  }

  // Sort
  const orderBy = {
    name_asc:   [{ type: "asc" }, { name: "asc" }],
    name_desc:  [{ type: "asc" }, { name: "desc" }],
    date_desc:  [{ type: "asc" }, { createdAt: "desc" }],
    date_asc:   [{ type: "asc" }, { createdAt: "asc" }],
    size_desc:  [{ type: "asc" }, { sizeBytes: "desc" }],
    size_asc:   [{ type: "asc" }, { sizeBytes: "asc" }],
  }[sort] ?? [{ type: "asc" }, { name: "asc" }];

  const items = await prisma.clientFile.findMany({ where, orderBy });
  const breadcrumbs = await getBreadcrumbs(folderId || null);

  return res.json({ items: items.map(formatItem), breadcrumbs });
});

// ── POST /api/clients/:clientId/files/folder ──────────────────────────────────
router.post("/folder", requirePermission("aplus.client_files.upload"), async (req, res) => {
  const { clientId } = req.params;
  const { name, parentId = null } = req.body;
  const section = resolveSection(req.body.section || req.query.section);

  if (!name || !name.trim()) return res.status(400).json({ error: "Folder name is required" });

  // Verify parentId belongs to this client+section (if provided)
  if (parentId) {
    const parent = await prisma.clientFile.findFirst({
      where: { id: parentId, clientId, section, type: "FOLDER", deletedAt: null },
    });
    if (!parent) return res.status(404).json({ error: "Parent folder not found" });
  }

  const folder = await prisma.clientFile.create({
    data: {
      clientId,
      section,
      parentId: parentId || null,
      type: "FOLDER",
      name: name.trim(),
      uploadedById: req.user?.sub ?? null,
    },
  });

  await writeAuditLog(req, {
    action: "CLIENT_FILE_FOLDER_CREATED",
    entityType: "ClientFile",
    entityId: folder.id,
    detailsJson: { clientId, section, name: folder.name, parentId },
  });

  return res.status(201).json(formatItem(folder));
});

// ── POST /api/clients/:clientId/files/upload ─────────────────────────────────
// Accepts: files[] (multipart), folderId + section (form fields)
router.post("/upload", requirePermission("aplus.client_files.upload"), (req, res, next) => {
  const uploader = makeClientFileUpload();
  uploader.array("files", 50)(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File too large. Maximum size is 200 MB." });
      }
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    next();
  });
}, async (req, res) => {
  const { clientId } = req.params;
  const folderId = req.body.folderId || null;
  const section = resolveSection(req.body.section || req.query.section);
  const files = req.files ?? [];

  if (!files.length) return res.status(400).json({ error: "No files received" });

  // Verify folder ownership + section match
  if (folderId) {
    const folder = await prisma.clientFile.findFirst({
      where: { id: folderId, clientId, section, type: "FOLDER", deletedAt: null },
    });
    if (!folder) return res.status(404).json({ error: "Target folder not found" });
  }

  const created = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).replace(".", "").toLowerCase();
    const relativePath = `clients/${clientId}/${file.filename}`;

    const record = await prisma.clientFile.create({
      data: {
        clientId,
        section,
        parentId: folderId || null,
        type: "FILE",
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype || null,
        extension: ext || null,
        sizeBytes: BigInt(file.size),
        storagePath: relativePath,
        uploadedById: req.user?.sub ?? null,
      },
    });
    created.push(formatItem(record));
  }

  await writeAuditLog(req, {
    action: "CLIENT_FILES_UPLOADED",
    entityType: "ClientFile",
    entityId: clientId,
    detailsJson: { clientId, section, count: created.length, folderId, files: created.map((f) => f.name) },
  });

  return res.status(201).json(created);
});

// ── GET /api/clients/:clientId/files/:id/download ─────────────────────────────
router.get("/:id/download", requirePermission("aplus.client_files.view"), async (req, res) => {
  const { clientId, id } = req.params;
  const item = await prisma.clientFile.findFirst({
    where: { id, clientId, type: "FILE", deletedAt: null },
  });
  if (!item) return res.status(404).json({ error: "File not found" });
  if (!item.storagePath) return res.status(404).json({ error: "File storage path missing" });

  const filePath = path.resolve(uploadDir, item.storagePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });

  await writeAuditLog(req, {
    action: "CLIENT_FILE_DOWNLOADED",
    entityType: "ClientFile",
    entityId: id,
    detailsJson: { clientId, name: item.name, section: item.section },
  });

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(item.originalName || item.name)}"`);
  res.setHeader("Content-Type", item.mimeType || "application/octet-stream");
  return res.sendFile(filePath);
});

// ── PATCH /api/clients/:clientId/files/:id/rename ────────────────────────────
router.patch("/:id/rename", requirePermission("aplus.client_files.edit"), async (req, res) => {
  const { clientId, id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const item = await prisma.clientFile.findFirst({ where: { id, clientId, deletedAt: null } });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const updated = await prisma.clientFile.update({
    where: { id },
    data: { name: name.trim() },
  });

  await writeAuditLog(req, {
    action: "CLIENT_FILE_RENAMED",
    entityType: "ClientFile",
    entityId: id,
    detailsJson: { clientId, section: item.section, oldName: item.name, newName: name.trim() },
  });

  return res.json(formatItem(updated));
});

// ── PATCH /api/clients/:clientId/files/:id/move ───────────────────────────────
router.patch("/:id/move", requirePermission("aplus.client_files.edit"), async (req, res) => {
  const { clientId, id } = req.params;
  const { parentId = null } = req.body;

  const item = await prisma.clientFile.findFirst({ where: { id, clientId, deletedAt: null } });
  if (!item) return res.status(404).json({ error: "Item not found" });

  // Prevent moving a folder into itself or its own subtree
  if (item.type === "FOLDER" && parentId) {
    let check = parentId;
    while (check) {
      if (check === id) return res.status(400).json({ error: "Cannot move a folder into itself" });
      const p = await prisma.clientFile.findUnique({ where: { id: check } });
      check = p?.parentId ?? null;
    }
  }

  if (parentId) {
    const target = await prisma.clientFile.findFirst({
      where: { id: parentId, clientId, section: item.section, type: "FOLDER", deletedAt: null },
    });
    if (!target) return res.status(404).json({ error: "Destination folder not found" });
  }

  const updated = await prisma.clientFile.update({
    where: { id },
    data: { parentId: parentId || null },
  });

  await writeAuditLog(req, {
    action: "CLIENT_FILE_MOVED",
    entityType: "ClientFile",
    entityId: id,
    detailsJson: { clientId, section: item.section, name: item.name, fromParentId: item.parentId, toParentId: parentId },
  });

  return res.json(formatItem(updated));
});

// ── DELETE /api/clients/:clientId/files/:id ───────────────────────────────────
// Soft-deletes the item (and cascade-marks children for folders)
router.delete("/:id", requirePermission("aplus.client_files.delete"), async (req, res) => {
  const { clientId, id } = req.params;
  const item = await prisma.clientFile.findFirst({ where: { id, clientId, deletedAt: null } });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const now = new Date();

  async function softDeleteTree(nodeId) {
    await prisma.clientFile.update({ where: { id: nodeId }, data: { deletedAt: now } });
    const children = await prisma.clientFile.findMany({ where: { parentId: nodeId, deletedAt: null } });
    for (const child of children) await softDeleteTree(child.id);
  }

  await softDeleteTree(id);

  await writeAuditLog(req, {
    action: "CLIENT_FILE_DELETED",
    entityType: "ClientFile",
    entityId: id,
    detailsJson: { clientId, section: item.section, name: item.name, type: item.type },
  });

  return res.status(204).send();
});

// ── GET /api/clients/:clientId/files/breadcrumb ───────────────────────────────
router.get("/breadcrumb", requirePermission("aplus.client_files.view"), async (req, res) => {
  const { folderId } = req.query;
  const breadcrumbs = await getBreadcrumbs(folderId || null);
  return res.json(breadcrumbs);
});

// ── GET /api/clients/:clientId/files/roots ────────────────────────────────────
// Returns { bba: "folderId", bbr: "folderId", ... } for quick-tab navigation.
// Lazily creates folders if any are missing.
router.get("/roots", requirePermission("aplus.client_files.view"), async (req, res) => {
  const { clientId } = req.params;
  const map = await getClientFolderIds(clientId);
  return res.json(map);
});

// ── GET all folders for a section (for move-to picker) ────────────────────────
router.get("/folders", requirePermission("aplus.client_files.view"), async (req, res) => {
  const { clientId } = req.params;
  const section = resolveSection(req.query.section);
  const folders = await prisma.clientFile.findMany({
    where: { clientId, section, type: "FOLDER", deletedAt: null },
    orderBy: { name: "asc" },
  });
  return res.json(folders.map(formatItem));
});

export default router;
