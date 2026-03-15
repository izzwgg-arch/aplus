import { prisma } from './prisma'
import { UserRole } from '@prisma/client'

/**
 * Activity logging utility
 * Logs user activities (e.g., LOGIN) for admin dashboard
 */

export interface LoginActivityData {
  actorUserId: string
  actorEmail: string
  actorRole: UserRole
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

/**
 * Create a login activity record
 * Prevents duplicate spam within 10 seconds for the same user
 */
export async function createLoginActivity(data: LoginActivityData): Promise<void> {
  try {
    // Check for recent login activity (within 10 seconds) to prevent duplicates
    const tenSecondsAgo = new Date(Date.now() - 10000)
    const recentActivity = await prisma.activity.findFirst({
      where: {
        actionType: 'LOGIN',
        actorUserId: data.actorUserId,
        createdAt: {
          gte: tenSecondsAgo,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // If a login was recorded within the last 10 seconds, skip creating a duplicate
    if (recentActivity) {
      console.log(`[ACTIVITY] Skipping duplicate login activity for user ${data.actorUserId} (recent activity found)`)
      return
    }

    // Create the activity record
    await prisma.activity.create({
      data: {
        actionType: 'LOGIN',
        actorUserId: data.actorUserId,
        actorEmail: data.actorEmail,
        actorRole: data.actorRole,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    })
  } catch (error) {
    // Don't fail the main operation if activity logging fails
    console.error('Failed to create login activity:', error)
  }
}
