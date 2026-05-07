import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireString } from "../utils/validation.js";
import { writeAuditLog } from "../services/auditLogService.js";

const router = express.Router();
router.use(requireAuth);

const MAX_SECTION_CONTENT_LENGTH = 150000;

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h2",
  "h3",
  "h4",
  "li",
  "ol",
  "p",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);

const ALLOWED_HTML_ATTRS = {
  a: new Set(["href", "target", "rel"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"])
};

const DANGEROUS_HTML_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "svg", "math"]);

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeHtmlAttributes(tagName, rawAttrs = "") {
  const allowedAttrs = ALLOWED_HTML_ATTRS[tagName] || new Set();
  const attrs = new Map();
  const attrPattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = attrPattern.exec(rawAttrs)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] ?? match[3] ?? match[4] ?? "";
    if (attrName.startsWith("on") || attrName === "style" || !allowedAttrs.has(attrName)) continue;
    if ((attrName === "href" || attrName === "src") && /^\s*javascript:/i.test(attrValue)) continue;
    if ((attrName === "colspan" || attrName === "rowspan") && !/^\d{1,2}$/.test(attrValue)) continue;
    attrs.set(attrName, attrValue);
  }

  if (tagName === "a") {
    attrs.set("target", "_blank");
    attrs.set("rel", "noreferrer");
  }

  return Array.from(attrs.entries())
    .map(([name, value]) => ` ${name}="${escapeHtmlAttribute(value)}"`)
    .join("");
}

function normalizeEmptyHtml(html) {
  return html
    .replace(/<p><br><\/p>/gi, "")
    .replace(/<div><br><\/div>/gi, "")
    .trim();
}

function sanitizeHtmlContent(value) {
  if (value === undefined || value === null) return "";
  const withoutDangerousBlocks = String(value)
    .slice(0, MAX_SECTION_CONTENT_LENGTH)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");

  const sanitized = withoutDangerousBlocks.replace(
    /<\s*(\/)?\s*([a-zA-Z][\w:-]*)([^>]*)>/g,
    (_match, closingSlash, rawTagName, rawAttrs) => {
      const tagName = rawTagName.toLowerCase();
      if (DANGEROUS_HTML_TAGS.has(tagName)) return "";
      if (!ALLOWED_HTML_TAGS.has(tagName)) return "";
      if (closingSlash) return `</${tagName}>`;
      return `<${tagName}${sanitizeHtmlAttributes(tagName, rawAttrs)}>`;
    }
  );

  return normalizeEmptyHtml(sanitized);
}

// ── List reports ──────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
  const status   = req.query.status   ? String(req.query.status)   : undefined;
  const reports  = await prisma.assessmentReport.findMany({
    where: { clientId, status },
    include: {
      client:   { select: { id: true, fullName: true } },
      template: { select: { id: true, name: true } },
      sections: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json(reports);
});

// ── Get single report with full sections ──────────────────────────────────────
router.get("/:id", async (req, res) => {
  const report = await prisma.assessmentReport.findUnique({
    where: { id: req.params.id },
    include: {
      client:   { select: { id: true, fullName: true } },
      template: { select: { id: true, name: true } },
      sections: { orderBy: { order: "asc" } },
    },
  });
  if (!report) return res.status(404).json({ error: "Report not found" });
  return res.json(report);
});

// ── Update report metadata ────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const report = await prisma.assessmentReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  const body = req.body || {};
  const updated = await prisma.assessmentReport.update({
    where: { id: req.params.id },
    data: {
      title:  body.title  !== undefined ? String(body.title)  : undefined,
      status: body.status !== undefined ? String(body.status) : undefined,
    },
    include: {
      client:   { select: { id: true, fullName: true } },
      template: { select: { id: true, name: true } },
      sections: { orderBy: { order: "asc" } },
    },
  });
  return res.json(updated);
});

// ── Delete report ─────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const report = await prisma.assessmentReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  await prisma.assessmentReport.delete({ where: { id: req.params.id } });
  await writeAuditLog(req, { action: "REPORT_DELETED", entityType: "AssessmentReport", entityId: req.params.id });
  return res.status(204).send();
});

// ── Replace / reorder all sections ───────────────────────────────────────────
router.put("/:id/sections", async (req, res) => {
  const report = await prisma.assessmentReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  const sections = Array.isArray(req.body.sections) ? req.body.sections : [];
  if (!sections.length) return res.status(400).json({ error: "sections array required" });
  await prisma.assessmentReportSection.deleteMany({ where: { reportId: req.params.id } });
  await prisma.assessmentReportSection.createMany({
    data: sections.map((s, i) => ({
      reportId: req.params.id,
      title:   requireString(s.title, "section.title"),
      order:   typeof s.order === "number" ? s.order : i,
      content: sanitizeHtmlContent(s.content),
    })),
  });
  const refreshed = await prisma.assessmentReport.findUnique({
    where: { id: req.params.id },
    include: {
      client:   { select: { id: true, fullName: true } },
      template: { select: { id: true, name: true } },
      sections: { orderBy: { order: "asc" } },
    },
  });
  return res.json(refreshed);
});

// ── Add a section ─────────────────────────────────────────────────────────────
router.post("/:id/sections", async (req, res) => {
  const report = await prisma.assessmentReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "Report not found" });
  const maxOrder = await prisma.assessmentReportSection.aggregate({
    where: { reportId: req.params.id },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;
  const section = await prisma.assessmentReportSection.create({
    data: {
      reportId: req.params.id,
      title:   requireString(req.body.title, "title"),
      order:   nextOrder,
      content: sanitizeHtmlContent(req.body.content),
    },
  });
  return res.status(201).json(section);
});

// ── Update a section ──────────────────────────────────────────────────────────
router.put("/:id/sections/:sectionId", async (req, res) => {
  const section = await prisma.assessmentReportSection.findFirst({
    where: { id: req.params.sectionId, reportId: req.params.id },
  });
  if (!section) return res.status(404).json({ error: "Section not found" });
  const updated = await prisma.assessmentReportSection.update({
    where: { id: req.params.sectionId },
    data: {
      title:   req.body.title   !== undefined ? String(req.body.title)   : undefined,
      content: req.body.content !== undefined ? sanitizeHtmlContent(req.body.content) : undefined,
      order:   req.body.order   !== undefined ? Number(req.body.order)   : undefined,
    },
  });
  return res.json(updated);
});

// ── Delete a section ──────────────────────────────────────────────────────────
router.delete("/:id/sections/:sectionId", async (req, res) => {
  const section = await prisma.assessmentReportSection.findFirst({
    where: { id: req.params.sectionId, reportId: req.params.id },
  });
  if (!section) return res.status(404).json({ error: "Section not found" });
  await prisma.assessmentReportSection.delete({ where: { id: req.params.sectionId } });
  return res.status(204).send();
});

export default router;
