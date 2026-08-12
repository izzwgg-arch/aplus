import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
router.use(requireAuth, requirePermission("aplus.audit_logs.view"));

function buildWhere(query) {
  const action = query.action ? String(query.action) : undefined;
  const startDate = query.startDate ? new Date(String(query.startDate)) : undefined;
  const endDate = query.endDate ? new Date(String(query.endDate)) : undefined;
  const createdAt = {};
  if (startDate && !Number.isNaN(startDate.getTime())) createdAt.gte = startDate;
  if (endDate && !Number.isNaN(endDate.getTime())) createdAt.lte = endDate;
  return {
    action,
    createdAt: Object.keys(createdAt).length ? createdAt : undefined
  };
}

function buildOrderBy(query) {
  const allowedSortFields = new Set(["createdAt", "action", "actorEmail"]);
  const requestedField = query.sortBy ? String(query.sortBy) : "createdAt";
  const requestedDirection = query.sortDir ? String(query.sortDir).toLowerCase() : "desc";
  const sortBy = allowedSortFields.has(requestedField) ? requestedField : "createdAt";
  const sortDir = requestedDirection === "asc" ? "asc" : "desc";
  return { [sortBy]: sortDir };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replaceAll("\"", "\"\"")}"`;
  }
  return str;
}

router.get("/", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const where = buildWhere(req.query);
  const orderBy = buildOrderBy(req.query);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit
    }),
    prisma.auditLog.count({ where })
  ]);
  return res.json({ items, total, limit, offset });
});

router.get("/export.csv", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 500), 2000);
  const where = buildWhere(req.query);
  const orderBy = buildOrderBy(req.query);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy,
    take: limit
  });

  const headers = ["createdAt", "action", "actorEmail", "targetType", "targetId", "ipAddress", "userAgent", "metadata"];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.action,
    log.actorEmail || "",
    log.targetType || "",
    log.targetId || "",
    log.ipAddress || "",
    log.userAgent || "",
    log.metadata ? JSON.stringify(log.metadata) : ""
  ]);
  const csv = [headers.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=audit-logs.csv");
  return res.send(csv);
});

export default router;
