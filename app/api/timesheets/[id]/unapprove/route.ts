import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logUpdate } from '@/lib/audit'
import { getUserPermissions } from '@/lib/permissions'

/**
 * UNAPPROVE TIMESHEET
 *
 * Flow:
 * 1. Check permissions
 * 2. Validate timesheet status (must be APPROVED)
 * 3. Prevent unapprove if emailed or invoiced
 * 4. In transaction:
 *    - Update timesheet: status → DRAFT, clear approvedAt/queuedAt
 *    - Soft-delete queued email items for this timesheet
 * 5. Log audit (non-blocking)
 * 6. Return updated timesheet
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  let session: any = null
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    if (!resolvedParams?.id) {
      return NextResponse.json(
        { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid timesheet ID' },
        { status: 400 }
      )
    }

    session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        { ok: false, code: 'PERMISSION_DENIED', message: 'Unauthorized - Please log in' },
        { status: 401 }
      )
    }

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
        { ok: false, code: 'NOT_FOUND', message: 'Timesheet not found' },
        { status: 404 }
      )
    }

    const userPermissions = await getUserPermissions(session.user.id)
    const isBCBA = timesheet.isBCBA
    const permissionKey = isBCBA ? 'bcbaTimesheets.unapprove' : 'timesheets.unapprove'
    const permission = userPermissions[permissionKey]

    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
    const hasPermission = isAdmin || (permission?.canApprove === true)

    if (!hasPermission) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Permission denied - Insufficient permissions to unapprove timesheets',
        },
        { status: 403 }
      )
    }

    if (timesheet.status !== 'APPROVED') {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: `Only approved timesheets can be unapproved. Current status: ${timesheet.status}`,
        },
        { status: 400 }
      )
    }

    if (timesheet.emailedAt || timesheet.invoicedAt || timesheet.invoiceId) {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'This timesheet has already been emailed or invoiced and cannot be unapproved',
        },
        { status: 400 }
      )
    }

    const timesheetId = resolvedParams.id
    const result = await prisma.$transaction(async (tx) => {
      const updatedTimesheet = await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: 'DRAFT',
          approvedAt: null,
          queuedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          lastEditedBy: session.user.id,
          lastEditedAt: new Date(),
        },
      })

      await tx.emailQueueItem.deleteMany({
        where: {
          entityType: isBCBA ? 'BCBA' : 'REGULAR',
          entityId: timesheetId,
        },
      })

      return updatedTimesheet
    })

    // Log audit (non-blocking)
    try {
      await logUpdate(
        isBCBA ? 'BCBATimesheet' : 'Timesheet',
        timesheetId,
        session.user.id,
        {
          status: timesheet.status,
          approvedAt: timesheet.approvedAt,
          queuedAt: timesheet.queuedAt,
        },
        {
          status: 'DRAFT',
          approvedAt: null,
          queuedAt: null,
        }
      )
    } catch (auditError) {
      console.error('Failed to create audit log (non-blocking):', auditError)
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Error unapproving timesheet:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to unapprove timesheet' },
      { status: 500 }
    )
  }
}
