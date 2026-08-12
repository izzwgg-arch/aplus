import fs from "fs";
import path from "path";
import multer from "multer";
import sanitize from "sanitize-filename";
import { env } from "../config/env.js";

const uploadDir = path.resolve(env.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

// ── Legacy upload (profile images, old documents) ────────────────────────────
const allowedMime = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png"
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = sanitize(file.originalname).replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMime.has(file.mimetype)) return cb(new Error("Unsupported file type"));
    return cb(null, true);
  }
});

// ── Client file manager upload (permissive — all types up to 200 MB) ─────────
// Stores files under  uploads/clients/<clientId>/<timestamp>-<safeName>
// req.params.clientId must be set by the route before multer runs.

export function makeClientFileUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const clientId = req.params.clientId || "shared";
        const dir = path.resolve(uploadDir, "clients", clientId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const safe = sanitize(file.originalname).replace(/\s+/g, "_") || "upload";
        cb(null, `${Date.now()}-${safe}`);
      }
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
    // No fileFilter — accept all mime types; validation is handled in the route
  });
}
