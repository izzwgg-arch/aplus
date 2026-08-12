import express from "express";
import multer from "multer";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { upload } from "../middleware/upload.js";
import { encryptText, decryptText } from "../utils/crypto.js";
import { getOrCreateClinicSettings } from "../services/settingsService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { syncClientToQuickbooks } from "../services/integrations/quickbooks/quickbooksService.js";
import { ensureClientDefaultFolders } from "../services/documentRootsService.js";

const router = express.Router();
router.use(requireAuth);

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(str)) return str;
  return `"${str.replace(/"/g, "\"\"")}"`;
}

// RFC 4180-compliant CSV parser — handles quoted fields with embedded newlines,
// commas, and doubled-quote escapes.  Returns an array of rows (each row = string[]).
function parseFullCSV(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuote = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (inQuote) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuote = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = "";
        i++;
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && raw[i + 1] === '\n') i++;
        row.push(field.trim());
        field = "";
        if (row.some((f) => f.length > 0)) rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // flush last row
  row.push(field.trim());
  if (row.some((f) => f.length > 0)) rows.push(row);

  return rows;
}

// Legacy single-line helper kept for export path
function splitCsvLine(line) {
  return parseFullCSV(line)[0] ?? [];
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strip to digits for duplicate detection (US-friendly: ignores leading 1). */
function phoneDigits(s) {
  const d = String(s ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

/** Returns trimmed cell value, or null if empty or same number as primary/secondary (no duplicates). */
function dedupePhoneCell(primary, secondary, cellValue) {
  const c = String(cellValue ?? "").trim();
  if (!c) return null;
  const cd = phoneDigits(c);
  if (!cd) return null;
  const pd = phoneDigits(primary);
  const sd = phoneDigits(secondary);
  if (pd && cd === pd) return null;
  if (sd && cd === sd) return null;
  return c;
}

function toCanonicalHeader(header) {
  const key = normalizeHeader(header);
  const map = {
    firstname: "firstName",
    lastname: "lastName",
    fullname: "fullName",
    clientname: "fullName",
    name: "fullName",
    patient: "fullName",
    patientname: "fullName",
    student: "fullName",
    studentname: "fullName",
    child: "fullName",
    childsname: "fullName",
    preferredname: "fullName",
    last: "lastName",
    first: "firstName",
    dob: "dob",
    dateofbirth: "dob",
    birthdate: "dob",
    // Primary phone
    phone: "phone",
    phone1: "phone",
    phonenumber: "phone",
    phoneprimary: "phone",
    primaryphone: "phone",
    homephone: "phone",
    homenumber: "phone",
    // Cell / mobile phone → phoneCell
    phone2: "phoneCell",
    cell: "phoneCell",
    cellphone: "phoneCell",
    cellnumber: "phoneCell",
    mobilenumber: "phoneCell",
    mobilephone: "phoneCell",
    mobile: "phoneCell",
    phonecell: "phoneCell",
    cellularphone: "phoneCell",
    cellular: "phoneCell",
    secondarynumber: "phoneCell",
    secondaryphone: "phoneCell",
    alternatephonenumber: "phoneCell",
    alternatephone: "phoneCell",
    // "Other" phone columns → own slot (preferred source for profile cellphone on re-import)
    otherphone: "otherPhone",
    otherphonenumber: "otherPhone",
    other: "otherPhone",
    phoneother: "otherPhone",
    phonetypeother: "otherPhone",
    othercell: "otherPhone",
    othermobile: "otherPhone",
    // Third / additional phone → phoneSecondary
    phone3: "phoneSecondary",
    phonesecondary: "phoneSecondary",
    additionalphone: "phoneSecondary",
    // Email
    email: "email",
    email1: "email",
    email2: "emailAlt",
    emailaddress: "email",
    // Address / misc
    zip: "zip",
    zipcode: "zip",
    postalcode: "zip",
    insurance: "insurance",
    insuranceprovider: "insurance",
    address: "address",
    streetaddress: "address",
    notes: "notes",
    note: "notes",
    hourlyrate: "hourlyRate",
    rate: "hourlyRate",
    status: "status",
    cancellationfeeenabled: "cancellationFeeEnabled",
    cancellationfee: "cancellationFeeEnabled",
    cancelationfeeenabled: "cancellationFeeEnabled"
  };
  return map[key] || null;
}

router.get("/export.csv", requirePermission("aplus.clients.view"), async (req, res) => {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" } });
  const rows = [
    ["firstName", "lastName", "fullName", "dob", "phone", "email", "zip", "insurance", "address", "notes", "hourlyRate", "status", "cancellationFeeEnabled"]
  ];
  for (const client of clients) {
    rows.push([
      client.firstName || "",
      client.lastName || "",
      client.fullName || "",
      client.dob ? client.dob.toISOString().slice(0, 10) : "",
      client.phone || "",
      client.email || "",
      client.zip || "",
      client.insurance || "",
      decryptText(client.addressEncrypted) || "",
      decryptText(client.notesEncrypted) || "",
      client.hourlyRate ?? "",
      client.status || "ACTIVE",
      client.cancellationFeeEnabled ? "true" : "false"
    ]);
  }
  const csvText = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  await writeAuditLog(req, {
    action: "CLIENTS_CSV_EXPORTED",
    entityType: "Client",
    detailsJson: { count: clients.length }
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"clients-export.csv\"");
  return res.status(200).send(csvText);
});

router.post("/import.csv", requirePermission("aplus.clients.create"), csvUpload.single("file"), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ error: "CSV file is required" });

  // skipDuplicates=true  → skip rows whose fullName already exists (safe re-import)
  // updatePhones=true    → when a duplicate is found, always overwrite phoneCell/phoneSecondary
  //                        from the CSV (even if the DB already has a value)
  // cellFromOtherOnly=true → profile cellphone comes ONLY from "Other" columns, not Cell/Mobile
  const skipDuplicates     = req.query.skipDuplicates !== "false";
  const updatePhones       = req.query.updatePhones   === "true";
  const cellFromOtherOnly  = req.query.cellFromOtherOnly === "true";

  const raw = req.file.buffer.toString("utf8").replace(/^\uFEFF/, "");

  // Use the full RFC 4180 parser — handles quoted fields with embedded newlines
  const allRows = parseFullCSV(raw);
  if (allRows.length < 2) return res.status(400).json({ error: "CSV must include a header row and at least one data row" });

  const headers = allRows[0];
  const headerIndex = {};
  headers.forEach((header, idx) => {
    const canonical = toCanonicalHeader(header);
    if (canonical && headerIndex[canonical] === undefined) headerIndex[canonical] = idx;
  });

  // Smart fallback: if no phoneCell column was recognised by name, find the first
  // unmapped column whose raw header looks like a secondary/cell phone.
  // This handles unusual names like "Parent Cell", "Phone 2", "Emergency Cell", etc.
  if (headerIndex.otherPhone === undefined) {
    const otherLikeRe = /\bother\b|other\s*phone|phone\s*other/i;
    for (let idx = 0; idx < headers.length; idx++) {
      const raw = String(headers[idx] || "").trim();
      if (otherLikeRe.test(raw)) {
        const alreadyUsed = Object.values(headerIndex).includes(idx);
        if (!alreadyUsed) { headerIndex.otherPhone = idx; break; }
      }
    }
  }
  if (headerIndex.phoneCell === undefined) {
    const phoneLikeRe =
      /cell|mobile|cell.*phone|phone.*cell|phone.*2|2.*phone|secondary|alternate|parent.*phone|guardian.*phone/i;
    for (let idx = 0; idx < headers.length; idx++) {
      const raw = String(headers[idx] || "").trim();
      if (phoneLikeRe.test(raw)) {
        const alreadyUsed = Object.values(headerIndex).includes(idx);
        if (!alreadyUsed) { headerIndex.phoneCell = idx; break; }
      }
    }
  }

  const requiredAnyName = ["fullName", "firstName", "lastName"].some((key) => headerIndex[key] !== undefined);
  if (!requiredAnyName) {
    return res.status(400).json({
      error: "CSV requires at least one name column. Accepted headers: fullName / name / firstName+lastName."
    });
  }
  const hasDobColumn = headerIndex.dob !== undefined;

  // Pre-load existing clients for O(1) duplicate checking
  // When updatePhones=true we need the id + current phone fields too
  const existingClients = skipDuplicates
    ? await prisma.client.findMany({
        select: { id: true, fullName: true, phone: true, phoneCell: true, phoneSecondary: true },
      })
    : [];
  const existingNames  = new Set(existingClients.map((c) => c.fullName.toLowerCase().trim()));
  const existingByName = new Map(existingClients.map((c) => [c.fullName.toLowerCase().trim(), c]));

  const settings = await getOrCreateClinicSettings();
  let imported = 0;
  let skipped  = 0;
  let updated  = 0;
  let defaultDobApplied = 0;
  const errors = [];

  for (let i = 1; i < allRows.length; i += 1) {
    const row = allRows[i];
    const get = (field) => {
      const idx = headerIndex[field];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    try {
      const firstName = get("firstName") || null;
      const lastName  = get("lastName")  || null;
      const fullName  = get("fullName")  || [lastName, firstName].filter(Boolean).join(" ");
      if (!fullName) {
        const rawCells = row.map((v, ci) => `${headers[ci] ?? `col${ci}`}: "${v}"`).join(" | ");
        throw new Error(`No name found. Raw row: ${rawCells}`);
      }

      // Extract phone values: "Other" columns use canonical otherPhone (preferred for cellphone)
      const phone            = get("phone")            || "";
      const fromOtherCol     = get("otherPhone")       || "";
      const fromCellCols     = get("phoneCell")        || "";
      const phoneSecValue    = get("phoneSecondary")   || "";
      const rawCellForProfile = cellFromOtherOnly
        ? fromOtherCol
        : (fromOtherCol || fromCellCols);
      const phoneCellValue = dedupePhoneCell(phone, phoneSecValue, rawCellForProfile);

      // Duplicate handling
      if (skipDuplicates && existingNames.has(fullName.toLowerCase().trim())) {
        if (updatePhones) {
          const existing = existingByName.get(fullName.toLowerCase().trim());
          if (existing) {
            const patch = {};
            const cellRaw = cellFromOtherOnly
              ? fromOtherCol
              : (fromOtherCol || fromCellCols);
            if (cellRaw.trim()) {
              const nextCell = dedupePhoneCell(
                existing.phone || phone,
                existing.phoneSecondary || phoneSecValue,
                cellRaw
              );
              patch.phoneCell = nextCell;
            }
            if (phoneSecValue.trim()) {
              const cellAfter = patch.phoneCell !== undefined ? patch.phoneCell : existing.phoneCell;
              const nextSec = dedupePhoneCell(existing.phone || phone, cellAfter, phoneSecValue);
              if (nextSec) patch.phoneSecondary = nextSec;
            }
            if (Object.keys(patch).length > 0) {
              await prisma.client.update({ where: { id: existing.id }, data: patch });
              updated++;
            }
          }
        }
        skipped++;
        continue;
      }
      const email = get("email") || get("emailAlt") || "";
      const zip   = get("zip")   || "";

      const dobRaw = hasDobColumn ? get("dob") : "";
      let parsedDob = null;
      if (dobRaw) {
        const d = new Date(dobRaw);
        if (!Number.isNaN(d.getTime())) {
          parsedDob = d;
        } else {
          parsedDob = new Date("2000-01-01T00:00:00.000Z");
          defaultDobApplied++;
        }
      }

      const statusRaw = get("status").toUpperCase();
      const status = ["ACTIVE", "INACTIVE", "WAITLIST"].includes(statusRaw) ? statusRaw : "ACTIVE";

      const feeRaw = get("cancellationFeeEnabled").toLowerCase();
      const cancellationFeeEnabled =
        feeRaw === "true"  || feeRaw === "1" ? true  :
        feeRaw === "false" || feeRaw === "0" ? false :
        settings.defaultCancellationFeeEnabled;

      const hourlyRateRaw = get("hourlyRate");

      const phoneSecondaryDeduped = dedupePhoneCell(phone, phoneCellValue, phoneSecValue);

      const created = await prisma.client.create({
        data: {
          firstName,
          lastName,
          fullName,
          dob: parsedDob,
          phone,
          phoneCell:        phoneCellValue,
          phoneSecondary:   phoneSecondaryDeduped,
          email,
          zip,
          insurance:        get("insurance") || null,
          addressEncrypted: encryptText(get("address") || "") ?? "",
          notesEncrypted:   encryptText(get("notes")   || "") ?? "",
          hourlyRate:       hourlyRateRaw ? Number(hourlyRateRaw) : null,
          status,
          cancellationFeeEnabled,
        },
        select: { id: true },
      });

      // Create default document folders for the new client
      await ensureClientDefaultFolders(created.id);

      existingNames.add(fullName.toLowerCase().trim()); // prevent intra-batch duplicates
      imported++;
    } catch (error) {
      errors.push({ row: i + 1, name: allRows[i]?.slice(0, 3).join(" | "), error: error.message || "Unknown error" });
    }
  }

  await writeAuditLog(req, {
    action: "CLIENTS_CSV_IMPORTED",
    entityType: "Client",
    detailsJson: { imported, skipped, updated, failed: errors.length, defaultDobApplied },
  });

  // Build column map for debugging (shows what each CSV header resolved to)
  const detectedColumns = {};
  headers.forEach((h) => {
    const norm = toCanonicalHeader(h);
    if (norm) detectedColumns[h] = norm;
  });
  const phoneCellHeader =
    headerIndex.otherPhone !== undefined ? headers[headerIndex.otherPhone] :
    headerIndex.phoneCell !== undefined ? headers[headerIndex.phoneCell] :
    null;
  const otherPhoneHeader = headerIndex.otherPhone !== undefined ? headers[headerIndex.otherPhone] : null;

  return res.json({
    imported,
    skipped,
    updated,
    failed:             errors.length,
    defaultDobApplied,
    totalRows:          allRows.length - 1,
    phoneCellHeader,
    otherPhoneHeader,
    cellFromOtherOnly,
    detectedColumns,
    errors,
  });
});

router.get("/", requirePermission("aplus.clients.view"), async (req, res) => {
  // ── Paginated lean mode (Clients directory) ──────────────────────────────
  // Activated when caller passes ?page= or ?limit=
  // Returns: { data, total, page, limit, totalPages }
  if (req.query.page !== undefined || req.query.limit !== undefined) {
    const page   = Math.max(1, Number(req.query.page  || 1));
    const limit  = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const search = (req.query.search || "").trim();
    const skip   = (page - 1) * limit;

    const where = {};
    if (search) {
      where.OR = [
        { fullName:  { contains: search, mode: "insensitive" } },
        { phone:     { contains: search, mode: "insensitive" } },
        { insurance: { contains: search, mode: "insensitive" } },
        { email:     { contains: search, mode: "insensitive" } },
      ];
    }
    if (req.query.defaultDobOnly === "true") {
      where.dob = new Date("2000-01-01T00:00:00.000Z");
    }

    const [total, clients] = await prisma.$transaction([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          dob: true,
          phone: true,
          phoneCell: true,
          phoneSecondary: true,
          email: true,
          insurance: true,
          status: true,
        }
      })
    ]);

    return res.json({
      data: clients,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  }

  // ── Minimal mode for dropdowns (waitlist, appointment selectors, etc.) ────
  // Returns only id + fullName — very fast, no decryption, no large payload
  if (req.query.fields === "minimal") {
    const clients = await prisma.client.findMany({
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, phone: true, phoneCell: true, phoneSecondary: true },
    });
    return res.json(clients);
  }

  // ── Legacy full-list mode (dropdowns in appointment/other pages) ─────────
  // Returns a flat array — no pagination — with decrypted fields
  const clients = await prisma.client.findMany({ orderBy: { fullName: "asc" } });
  return res.json(
    clients
      .map((c) => ({ ...c, address: decryptText(c.addressEncrypted), notes: decryptText(c.notesEncrypted) }))
      .sort((a, b) => (a.fullName ?? "").trim().toLowerCase().localeCompare((b.fullName ?? "").trim().toLowerCase()))
  );
});

router.post("/", requirePermission("aplus.clients.create"), async (req, res) => {
  const data = req.body;
  const settings = await getOrCreateClinicSettings();
  const firstName = data.firstName ? String(data.firstName).trim() : null;
  const lastName = data.lastName ? String(data.lastName).trim() : null;
  // Store as "LastName FirstName" so alphabetical sort naturally orders by last name
  const fullName = data.fullName || [lastName, firstName].filter(Boolean).join(" ");
  if (!fullName) return res.status(400).json({ error: "Client full name is required" });
  const created = await prisma.client.create({
    data: {
      firstName,
      lastName,
      fullName,
      // DOB is optional — guard against null/empty/undefined so Prisma never receives Invalid Date
      dob: data.dob ? new Date(data.dob) : null,
      phone: data.phone,
      phoneCell: data.phoneCell || null,
      phoneSecondary: data.phoneSecondary || null,
      email: data.email,
      zip: data.zip,
      insurance: data.insurance || null,
      addressEncrypted: encryptText(data.address || "") ?? "",
      notesEncrypted: encryptText(data.notes || "") ?? "",
      hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : null,
      profileImageUrl: data.profileImageUrl || null,
      status: data.status || "ACTIVE",
      cancellationFeeEnabled: typeof data.cancellationFeeEnabled === "boolean"
        ? data.cancellationFeeEnabled
        : settings.defaultCancellationFeeEnabled
    }
  });
  // Auto-create all required document workspace roots for the new client
  await ensureClientDefaultFolders(created.id);

  await writeAuditLog(req, {
    action: "CLIENT_CREATED",
    entityType: "Client",
    entityId: created.id
  });
  return res.status(201).json(created);
});

router.put("/:id", requirePermission("aplus.clients.edit"), async (req, res) => {
  const data = req.body;
  const fn = data.firstName !== undefined ? String(data.firstName).trim() : null;
  const ln = data.lastName  !== undefined ? String(data.lastName).trim()  : null;
  // Rebuild fullName as "LastName FirstName" if first/last provided, else trust sent fullName
  const derivedFullName = (fn !== null || ln !== null)
    ? [ln, fn].filter(Boolean).join(" ")
    : undefined;
  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      firstName: fn !== null ? fn : undefined,
      lastName:  ln !== null ? ln : undefined,
      fullName:  derivedFullName || data.fullName || undefined,
      // Allow explicitly clearing DOB (send null) or leaving unchanged (undefined)
      dob: data.dob !== undefined ? (data.dob ? new Date(data.dob) : null) : undefined,
      phone: data.phone,
      phoneCell: data.phoneCell !== undefined ? (data.phoneCell || null) : undefined,
      phoneSecondary: data.phoneSecondary !== undefined ? (data.phoneSecondary || null) : undefined,
      email: data.email,
      zip:   data.zip,
      insurance: data.insurance || null,
      // Always update encrypted fields when present (allows clearing them)
      addressEncrypted: data.address !== undefined ? (encryptText(data.address ?? "") ?? "") : undefined,
      notesEncrypted:   data.notes   !== undefined ? (encryptText(data.notes   ?? "") ?? "") : undefined,
      hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : null,
      profileImageUrl: data.profileImageUrl || undefined,
      status: data.status || undefined,
      cancellationFeeEnabled: typeof data.cancellationFeeEnabled === "boolean" ? data.cancellationFeeEnabled : undefined
    }
  });
  await writeAuditLog(req, {
    action: "CLIENT_UPDATED",
    entityType: "Client",
    entityId: updated.id
  });

  if (data.communicationPreference && typeof data.communicationPreference === "object") {
    const cp = data.communicationPreference;
    const prefChannel = String(cp.preferredChannel || "BOTH").toUpperCase();
    const safeChannel = ["EMAIL", "SMS", "BOTH"].includes(prefChannel) ? prefChannel : "BOTH";
    await prisma.clientCommunicationPreference.upsert({
      where: { clientId: updated.id },
      create: {
        clientId: updated.id,
        emailRemindersEnabled: cp.emailRemindersEnabled !== false,
        smsRemindersEnabled: cp.smsRemindersEnabled !== false,
        preferredChannel: safeChannel,
        smsOptOut: Boolean(cp.smsOptOut),
        smsOptOutAt: cp.smsOptOut ? new Date() : null,
        reminderNotes: cp.reminderNotes ? String(cp.reminderNotes).slice(0, 500) : null
      },
      update: {
        ...(typeof cp.emailRemindersEnabled === "boolean" ? { emailRemindersEnabled: cp.emailRemindersEnabled } : {}),
        ...(typeof cp.smsRemindersEnabled === "boolean" ? { smsRemindersEnabled: cp.smsRemindersEnabled } : {}),
        ...(cp.preferredChannel ? { preferredChannel: safeChannel } : {}),
        ...(typeof cp.smsOptOut === "boolean"
          ? { smsOptOut: cp.smsOptOut, smsOptOutAt: cp.smsOptOut ? new Date() : null }
          : {}),
        ...(cp.reminderNotes !== undefined
          ? { reminderNotes: cp.reminderNotes ? String(cp.reminderNotes).slice(0, 500) : null }
          : {})
      }
    });
  }

  return res.json(updated);
});

router.get("/:id", requirePermission("aplus.clients.view"), async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      communicationPreference: true,
      appointments: { orderBy: { startsAt: "desc" } },
      invoices: { include: { payments: true, lineItems: true }, orderBy: { createdAt: "desc" } },
      payments: { include: { refunds: true }, orderBy: { paymentDate: "desc" } },
      paymentMethodSnapshots: { orderBy: { createdAt: "desc" } },
      assessments: { orderBy: { createdAt: "desc" } },
      dataTrackingEntries: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { uploadedAt: "desc" } }
    }
  });
  if (!client) return res.status(404).json({ error: "Client not found" });
  return res.json({
    ...client,
    address: decryptText(client.addressEncrypted),
    notes: decryptText(client.notesEncrypted)
  });
});

router.patch("/:id/status", requirePermission("aplus.clients.edit"), async (req, res) => {
  const status = req.body?.status;
  if (!["ACTIVE", "INACTIVE", "WAITLIST"].includes(status)) {
    return res.status(400).json({ error: "Invalid client status" });
  }
  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: { status }
  });
  await writeAuditLog(req, {
    action: "CLIENT_STATUS_UPDATED",
    entityType: "Client",
    entityId: updated.id,
    detailsJson: { status }
  });
  return res.json(updated);
});

router.post("/:id/profile-image", requirePermission("aplus.clients.edit"), upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing image file" });
  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: { profileImageUrl: req.file.path }
  });
  await writeAuditLog(req, {
    action: "CLIENT_PROFILE_IMAGE_UPDATED",
    entityType: "Client",
    entityId: updated.id
  });
  return res.json(updated);
});

router.post("/:id/documents", requirePermission("aplus.client_files.upload"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  const doc = await prisma.document.create({
    data: {
      clientId: req.params.id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype
    }
  });
  await writeAuditLog(req, {
    action: "CLIENT_DOCUMENT_UPLOADED",
    entityType: "Client",
    entityId: req.params.id,
    detailsJson: { documentId: doc.id, fileName: doc.fileName }
  });
  return res.status(201).json(doc);
});

router.post("/:id/sync/quickbooks", requirePermission("aplus.quickbooks.trigger_sync"), async (req, res) => {
  try {
    const result = await syncClientToQuickbooks(req.params.id, { userId: req.user?.id, triggerType: "user" });
    await writeAuditLog(req, {
      action: "QUICKBOOKS_CLIENT_SYNC_TRIGGERED",
      entityType: "Client",
      entityId: req.params.id
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Client sync failed" });
  }
});

// ---------------------------------------------------------------------------
// DELETE CLIENT
// ---------------------------------------------------------------------------
router.delete("/:id", requirePermission("aplus.clients.delete"), async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, fullName: true } });
  if (!client) return res.status(404).json({ error: "Client not found." });

  // Cascade deletes all related data (appointments, invoices, files, etc.)
  // Prisma schema uses onDelete: Cascade for all Client relations.
  await prisma.client.delete({ where: { id: req.params.id } });

  await writeAuditLog(req, {
    action: "CLIENT_DELETED",
    entityType: "Client",
    entityId: req.params.id,
    detailsJson: { fullName: client.fullName }
  });
  return res.json({ success: true });
});

export default router;
