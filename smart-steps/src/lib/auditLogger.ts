/**
 * HIPAA Audit Logger — Smart Steps ABA Tracker
 * Writes structured audit entries for all PHI access and mutations.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export type AuditAction =
  | "VIEW_CLIENT"
  | "VIEW_REPORT"
  | "CREATE_SESSION"
  | "END_SESSION"
  | "LOG_TRIAL"
  | "LOG_BEHAVIOR"
  | "EXPORT_REPORT"
  | "UPDATE_TARGET"
  | "UPDATE_PROGRAM"
  | "UPDATE_BEHAVIOR_PLAN"
  | "DELETE_RECORD"
  | "SSO_LOGIN"
  | "MANUAL_LOGIN"
  | "LOGOUT"
  | "PERMISSION_DENIED"
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_PERMISSIONS_UPDATED"
  | "USER_ROLE_ASSIGNED"
  | "USER_CREATED"
  | "USER_PASSWORD_SET"
  | "CLIENT_ASSIGNMENT_CREATED"
  | "CLIENT_ASSIGNMENT_REMOVED";

export async function auditLog(
  userId: string,
  action: AuditAction,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    // Ensure the user row exists (SSO users may not exist in smart_steps.User yet)
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `sso-${userId}@smart-steps.local`,
        name: "Therapist",
        role: "RBT",
      },
    }).catch(() => {}); // silent — user creation is best-effort for audit

    await prisma.auditEntry.create({
      data: {
        userId,
        action,
        entityType,
        entityId: entityId ?? null,
        details: details ? (details as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Never let audit logging crash the application
    console.error("[AuditLogger] Failed to write audit entry", { userId, action, entityType, entityId });
  }
}

/** Convenience: log a trial batch */
export async function auditTrials(userId: string, sessionId: string, count: number) {
  return auditLog(userId, "LOG_TRIAL", "Session", sessionId, { trialCount: count });
}

/** Convenience: log a report export */
export async function auditExport(userId: string, format: string, clientId?: string | null) {
  return auditLog(userId, "EXPORT_REPORT", "Report", clientId, { format });
}
