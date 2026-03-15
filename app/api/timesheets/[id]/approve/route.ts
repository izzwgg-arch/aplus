import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logApprove, logQueue } from '@/lib/audit'
import { getUserPermissions } from '@/lib/permissions'

/**
 * APPROVE TIMESHEET (REBUILT - CLEAN)
 * 
 * Transactional flow:
 * 1. Check permissions
 * 2. Validate timesheet status (must be DRAFT)
 * 3. In transaction:
 *    - Update timesheet: status → APPROVED, approvedAt, queuedAt
 *    - Create EmailQueueItem (with unique constraint protection)
 *    - Log audit
 * 4. Return updated timesheet
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  let resolvedParams: { id: string } | null = null
  let session: any = null
  try {
    resolvedParams = params instanceof Promise ? await params : params
    if (!resolvedParams) {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'Invalid timesheet ID',
        },
        { status: 400 }
      )
    }
    
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

    // Fetch timesheet with relations
    const timesheet = await prisma.timesheet.findUnique({
      where: { id: resolvedParams.id },
      include: {
        client: true,
        provider: true,
        bcba: true,
        user: true,
      },
    })

    if (!timesheet || timesheet.deletedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Timesheet not found',
        },
        { status: 404 }
      )
    }

    // Check permissions based on timesheet type
    const userPermissions = await getUserPermissions(session.user.id)
    const isBCBA = timesheet.isBCBA
    const permissionKey = isBCBA ? 'bcbaTimesheets.approve' : 'timesheets.approve'
    const permission = userPermissions[permissionKey]
    
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
    const hasPermission = isAdmin || (permission?.canApprove === true)

    if (!hasPermission) {
      console.error('[APPROVE TIMESHEET] Permission denied:', {
        userId: session.user.id,
        userRole: session.user.role,
        permissionKey,
        hasPermission: permission?.canApprove,
        isAdmin,
      })
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Permission denied - Insufficient permissions to approve timesheets',
        },
        { status: 403 }
      )
    }

    // Only DRAFT timesheets can be approved
    if (timesheet.status !== 'DRAFT') {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: `Only draft timesheets can be approved. Current status: ${timesheet.status}`,
        },
        { status: 400 }
      )
    }

    // Prevent approving already-emailed timesheets
    if (timesheet.emailedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'This timesheet has already been emailed and cannot be approved again',
        },
        { status: 400 }
      )
    }

    // Transactional approval + queue
    const timesheetId = resolvedParams.id // Store in const for TypeScript
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update timesheet to APPROVED and set queuedAt
      const updatedTimesheet = await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          queuedAt: new Date(),
        },
      })

      // 2. Create email queue item (unique constraint prevents duplicates)
      // Get default recipients for timesheet approval emails
      const defaultRecipients = process.env.EMAIL_APPROVAL_RECIPIENTS || 'info@productivebilling.com,jacobw@apluscenterinc.org'
      const emailSubject = isBCBA 
        ? `Smart Steps ABA – BCBA Timesheet Approved`
        : `Smart Steps ABA – Timesheet Approved`
      
      // If a queue item already exists (unique constraint in DB), revive it instead of creating a duplicate
      const reviveResult = await tx.emailQueueItem.updateMany({
        where: {
          entityType: isBCBA ? 'BCBA' : 'REGULAR',
          entityId: timesheetId,
        },
        data: {
          status: 'QUEUED',
          deletedAt: null,
          deletedByUserId: null,
          errorMessage: null,
          lastError: null,
          attempts: 0,
          queuedAt: new Date(),
          toEmail: defaultRecipients,
          subject: emailSubject,
          context: 'MAIN',
        },
      })

      if (reviveResult.count === 0) {
        try {
          await tx.emailQueueItem.create({
            data: {
              entityType: isBCBA ? 'BCBA' : 'REGULAR',
              entityId: timesheetId,
              queuedByUserId: session.user.id,
              status: 'QUEUED',
              toEmail: defaultRecipients,
              subject: emailSubject,
              context: 'MAIN', // Mark as MAIN email queue
            },
          })
        } catch (queueError: any) {
          // If unique constraint violation, item already exists - that's OK
          if (queueError?.code === 'P2002') {
            // Queue item already exists, continue
          } else {
            throw queueError // Re-throw other errors to rollback
          }
        }
      }

      // 3. Log audit (non-blocking, but in transaction for consistency)
      try {
        const auditAction = isBCBA ? 'BCBA_TIMESHEET_APPROVED' : 'TIMESHEET_APPROVED'
        await tx.auditLog.create({
          data: {
            action: auditAction as any,
            entityType: isBCBA ? 'BCBATimesheet' : 'Timesheet',
            entityId: timesheetId,
            userId: session.user.id,
            metadata: JSON.stringify({
              clientName: timesheet.client.name,
              providerName: timesheet.provider.name,
              bcbaName: timesheet.bcba.name,
              startDate: timesheet.startDate.toISOString(),
              endDate: timesheet.endDate.toISOString(),
            }),
          },
        })
      } catch (auditError) {
        // Log but don't fail transaction
        console.error('Failed to create audit log (non-blocking):', auditError)
      }

      return updatedTimesheet
    })

    // Log queue action (outside transaction, non-blocking)
    try {
      await logQueue(
        isBCBA ? 'BCBATimesheet' : 'Timesheet',
        timesheetId,
        session.user.id,
        {
          clientName: timesheet.client.name,
          providerName: timesheet.provider.name,
        }
      )
    } catch (error) {
      console.error('Failed to log queue action (non-blocking):', error)
    }

    return NextResponse.json({
      ok: true,
      data: result,
    })
  } catch (error: any) {
    console.error('[APPROVE TIMESHEET] Error:', {
      route: `/api/timesheets/${resolvedParams?.id || 'unknown'}/approve`,
      userId: session?.user?.id,
      userRole: session?.user?.role,
      timesheetId: resolvedParams?.id,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorStack: error?.stack,
    })
    
    // Handle unique constraint violation gracefully
    if (error?.code === 'P2002') {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'This timesheet is already queued for email',
        },
        { status: 409 }
      )
    }

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
        message: 'Failed to approve timesheet',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
