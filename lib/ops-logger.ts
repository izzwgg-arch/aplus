/**
 * Ops Center Centralized Logging Utility
 *
 * Server-side only. Writes to AppEventLog table in DB.
 * Never logs secrets, tokens, passwords, or raw PHI.
 * Safe to fail — logging errors never crash the app.
 *
 * Categories:
 *   APP_ACTIVITY | ERROR | SECURITY | AUTH | OPS_ACTION
 *   SYSTEM | BREACH | API | BACKUP | HEALTH | ALERT | AUDIT
 *
 * Levels: info | warning | error | critical
 */

import { prisma } from './prisma'
import { randomUUID } from 'crypto'

export type LogLevel = 'info' | 'warning' | 'error' | 'critical'

export type LogCategory =
  | 'APP_ACTIVITY'
  | 'ERROR'
  | 'SECURITY'
  | 'AUTH'
  | 'OPS_ACTION'
  | 'SYSTEM'
  | 'BREACH'
  | 'API'
  | 'BACKUP'
  | 'HEALTH'
  | 'ALERT'
  | 'AUDIT'

export interface OpsLogEntry {
  level: LogLevel
  category: LogCategory
  source: string
  eventType: string
  message: string
  actorUserId?: string
  actorEmail?: string
  actorRole?: string
  route?: string
  ipAddress?: string
  targetType?: string
  targetId?: string
  correlationId?: string
  metadata?: Record<string, unknown>
  status?: 'success' | 'failure' | 'pending'
}

const MAX_METADATA_BYTES = 2000
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'key', 'auth', 'cookie',
  'authorization', 'credential', 'hash', 'salt', 'jwt',
  'access_token', 'refresh_token', 'private', 'ssn', 'dob',
])

/** Strip sensitive keys from a metadata object */
function sanitizeMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) continue
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      clean[k] = sanitizeMetadata(v as Record<string, unknown>)
    } else {
      clean[k] = v
    }
  }
  return clean
}

/** Truncate serialized metadata to safe size */
function serializeMetadata(data?: Record<string, unknown>): string | null {
  if (!data) return null
  try {
    const cleaned = sanitizeMetadata(data)
    const json = JSON.stringify(cleaned)
    if (json.length > MAX_METADATA_BYTES) {
      return JSON.stringify({ _truncated: true, preview: json.substring(0, 200) })
    }
    return json
  } catch {
    return null
  }
}

/** Truncate a string to max length */
function cap(s: string | undefined, max = 500): string | undefined {
  if (!s) return undefined
  return s.length > max ? s.substring(0, max) + '…' : s
}

/**
 * Core write function. Never throws — logging failures are swallowed.
 */
async function writeLog(entry: OpsLogEntry): Promise<void> {
  try {
    await prisma.appEventLog.create({
      data: {
        id: randomUUID(),
        level: entry.level,
        category: entry.category,
        source: cap(entry.source, 100) ?? 'unknown',
        eventType: cap(entry.eventType, 100) ?? 'UNKNOWN',
        message: cap(entry.message, 1000) ?? '',
        actorUserId: entry.actorUserId ?? null,
        actorEmail: cap(entry.actorEmail, 200) ?? null,
        actorRole: cap(entry.actorRole, 50) ?? null,
        route: cap(entry.route, 300) ?? null,
        ipAddress: cap(entry.ipAddress, 45) ?? null,
        targetType: cap(entry.targetType, 100) ?? null,
        targetId: cap(entry.targetId, 200) ?? null,
        correlationId: entry.correlationId ?? null,
        metadata: serializeMetadata(entry.metadata),
        status: entry.status ?? null,
      },
    })
  } catch {
    // Silently fail — logging must never crash the app
  }
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export function logOpsAction(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: 'info', category: 'OPS_ACTION', source: 'ops-center', eventType, message, ...opts })
}

export function logErrorEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: 'error', category: 'ERROR', source: opts.source ?? 'api', eventType, message, ...opts })
}

export function logSecurityEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: opts.level ?? 'warning', category: 'SECURITY', source: opts.source ?? 'crowdsec', eventType, message, ...opts })
}

export function logBreachEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: 'critical', category: 'BREACH', source: opts.source ?? 'security', eventType, message, ...opts })
}

export function logAuthEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: opts.level ?? 'info', category: 'AUTH', source: 'auth', eventType, message, ...opts })
}

export function logApiEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: opts.level ?? 'info', category: 'API', source: opts.route ?? 'api', eventType, message, ...opts })
}

export function logAppActivity(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: 'info', category: 'APP_ACTIVITY', source: opts.source ?? 'app', eventType, message, ...opts })
}

export function logBackupEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: opts.level ?? 'info', category: 'BACKUP', source: 'backup', eventType, message, ...opts })
}

export function logHealthEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: opts.level ?? 'info', category: 'HEALTH', source: 'healthcheck', eventType, message, ...opts })
}

export function logSystemEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: opts.level ?? 'info', category: 'SYSTEM', source: 'system', eventType, message, ...opts })
}

export function logAlertEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: opts.level ?? 'warning', category: 'ALERT', source: opts.source ?? 'ops-center', eventType, message, ...opts })
}

export function logAuditEvent(
  eventType: string,
  message: string,
  opts: Partial<OpsLogEntry> = {}
): Promise<void> {
  return writeLog({ level: 'info', category: 'AUDIT', source: opts.source ?? 'admin', eventType, message, ...opts })
}

/** Generic log for any category */
export function writeOpsLog(entry: OpsLogEntry): Promise<void> {
  return writeLog(entry)
}
