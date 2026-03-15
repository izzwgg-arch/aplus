import { prisma } from './prisma'
import { AuditAction } from '@prisma/client'

/**
 * Audit logging utility
 * Logs all critical actions in the system for compliance and tracking
 */

export interface AuditLogData {
  action: AuditAction
  entityType: string // Model name (e.g., 'User', 'Timesheet', 'Invoice')
  entityId: string
  userId: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  metadata?: Record<string, any> // Additional context as JSON
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        userId: data.userId,
        oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
        newValues: data.newValues ? JSON.stringify(data.newValues) : null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    })
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error('Failed to create audit log:', error)
  }
}

/**
 * Log a CREATE action
 */
export async function logCreate(
  entityType: string,
  entityId: string,
  userId: string,
  newValues: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'CREATE',
    entityType,
    entityId,
    userId,
    newValues,
  })
}

/**
 * Log an UPDATE action
 */
export async function logUpdate(
  entityType: string,
  entityId: string,
  userId: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'UPDATE',
    entityType,
    entityId,
    userId,
    oldValues,
    newValues,
  })
}

/**
 * Log a DELETE action
 */
export async function logDelete(
  entityType: string,
  entityId: string,
  userId: string,
  oldValues: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'DELETE',
    entityType,
    entityId,
    userId,
    oldValues,
  })
}

/**
 * Log an APPROVE action
 */
export async function logApprove(
  entityType: string,
  entityId: string,
  userId: string,
  details?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'APPROVE',
    entityType,
    entityId,
    userId,
    newValues: details,
  })
}

/**
 * Log a REJECT action
 */
export async function logReject(
  entityType: string,
  entityId: string,
  userId: string,
  reason?: string
): Promise<void> {
  await createAuditLog({
    action: 'REJECT',
    entityType,
    entityId,
    userId,
    newValues: reason ? { reason } : undefined,
  })
}

// SUBMIT action removed - replaced with APPROVE/REJECT workflow

// LOCK action removed - no longer using LOCKED status

/**
 * Log a GENERATE action (e.g., invoice generation)
 */
export async function logGenerate(
  entityType: string,
  entityId: string,
  userId: string,
  details?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'GENERATE',
    entityType,
    entityId,
    userId,
    newValues: details,
  })
}

/**
 * Log a PAYMENT action
 */
export async function logPayment(
  entityType: string,
  entityId: string,
  userId: string,
  paymentDetails: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'PAYMENT',
    entityType,
    entityId,
    userId,
    newValues: paymentDetails,
  })
}

/**
 * Log an ADJUSTMENT action
 */
export async function logAdjustment(
  entityType: string,
  entityId: string,
  userId: string,
  adjustmentDetails: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'ADJUSTMENT',
    entityType,
    entityId,
    userId,
    newValues: adjustmentDetails,
  })
}

/**
 * Log a QUEUE action (when item is queued for email)
 */
export async function logQueue(
  entityType: string,
  entityId: string,
  userId: string,
  details?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'QUEUE',
    entityType,
    entityId,
    userId,
    newValues: details,
  })
}

/**
 * Log an EMAIL_SENT action
 */
export async function logEmailSent(
  entityType: string,
  entityId: string,
  userId: string,
  details?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'EMAIL_SENT',
    entityType,
    entityId,
    userId,
    metadata: details,
  })
}

/**
 * Log an EMAIL_FAILED action
 */
export async function logEmailFailed(
  entityType: string,
  entityId: string,
  userId: string,
  errorMessage: string,
  details?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'EMAIL_FAILED',
    entityType,
    entityId,
    userId,
    metadata: { error: errorMessage, ...details },
  })
}
