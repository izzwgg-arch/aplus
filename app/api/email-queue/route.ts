import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

/**
 * GET EMAIL QUEUE (REBUILT - CLEAN)
 * 
 * Returns all queued items with timesheet details
 * Permission: emailQueue.view
 */
export async function GET(request: NextRequest) {
  let session: any = null
  try {
    session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Unauthorized - Please log in',
        },
        { status: 401 }
      )
    }

    // Check permissions
    const userPermissions = await getUserPermissions(session.user.id)
    const canViewQueue =
      userPermissions['emailQueue.view']?.canView === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canViewQueue) {
      console.error('[EMAIL QUEUE] Permission denied:', {
        userId: session.user.id,
        userRole: session.user.role,
        hasPermission: userPermissions['emailQueue.view']?.canView,
      })
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Permission denied - Not authorized to view email queue',
        },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') // 'QUEUED', 'SENT', 'FAILED', or null for all

    const where: any = {
      deletedAt: null, // Only show non-deleted items
    }
    if (status) {
      where.status = status
    }

    // Fetch all queue items (excluding deleted)
    const queueItems = await prisma.emailQueueItem.findMany({
      where,
      orderBy: { queuedAt: 'desc' },
      include: {
        queuedBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    })

    // Fetch timesheet details for each item
    const itemsWithTimesheets = await Promise.all(
      queueItems.map(async (item) => {
        try {
          const timesheet = await prisma.timesheet.findFirst({
            where: {
              id: item.entityId,
              deletedAt: null,
            },
            include: {
              client: { select: { name: true } },
              provider: { select: { name: true } },
              bcba: { select: { name: true } },
              entries: {
                select: {
                  minutes: true,
                },
              },
            },
          })

          if (!timesheet) {
            return {
              id: item.id,
              entityType: item.entityType,
              entityId: item.entityId,
              queuedAt: item.queuedAt.toISOString(),
              sentAt: item.sentAt?.toISOString() || null,
              status: item.status,
              errorMessage: item.errorMessage || 'Timesheet not found or deleted',
              batchId: item.batchId,
              queuedBy: item.queuedBy,
              toEmail: item.toEmail,
              subject: item.subject,
              attempts: item.attempts,
              lastError: item.lastError,
              timesheet: null,
            }
          }

          const totalMinutes = timesheet.entries.reduce((sum, entry) => sum + entry.minutes, 0)
          const totalHours = totalMinutes / 60

          return {
            id: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            queuedAt: item.queuedAt.toISOString(),
            sentAt: item.sentAt?.toISOString() || null,
            status: item.status,
            errorMessage: item.errorMessage,
            batchId: item.batchId,
            queuedBy: item.queuedBy,
            toEmail: item.toEmail,
            subject: item.subject,
            attempts: item.attempts,
            lastError: item.lastError,
            timesheet: {
              id: timesheet.id,
              client: timesheet.client,
              provider: timesheet.provider,
              bcba: timesheet.bcba,
              startDate: timesheet.startDate.toISOString(),
              endDate: timesheet.endDate.toISOString(),
              totalHours,
              serviceType: timesheet.serviceType || undefined,
              sessionData: timesheet.sessionData || undefined,
            },
          }
        } catch (error: any) {
          console.error(`Error fetching timesheet ${item.entityId}:`, error)
          return {
            id: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            queuedAt: item.queuedAt.toISOString(),
            sentAt: item.sentAt?.toISOString() || null,
            status: item.status,
            errorMessage: item.errorMessage || `Error loading timesheet: ${error.message || 'Unknown error'}`,
            batchId: item.batchId,
            queuedBy: item.queuedBy,
            toEmail: item.toEmail,
            subject: item.subject,
            attempts: item.attempts,
            lastError: item.lastError,
            timesheet: null,
          }
        }
      })
    )

    return NextResponse.json({
      ok: true,
      items: itemsWithTimesheets,
    })
  } catch (error: any) {
    console.error('[EMAIL QUEUE] Error:', {
      route: '/api/email-queue',
      userId: session?.user?.id,
      userRole: session?.user?.role,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorStack: error?.stack,
    })
    
    // Handle Prisma column errors
    if (error?.code === 'P2022' || error?.code === 'P2025') {
      return NextResponse.json(
        {
          ok: false,
          code: 'DB_ERROR',
          message: 'Database schema mismatch. Please contact administrator.',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      {
        ok: false,
        code: 'DB_ERROR',
        message: 'Failed to fetch email queue',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
