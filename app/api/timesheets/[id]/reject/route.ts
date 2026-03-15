import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logReject } from '@/lib/audit'
import { getUserPermissions } from '@/lib/permissions'

/**
 * REJECT TIMESHEET (REBUILT - CLEAN)
 * 
 * Flow:
 * 1. Check permissions
 * 2. Validate timesheet status (must be DRAFT)
 * 3. Update timesheet: status → REJECTED, rejectedAt, rejectionReason
 * 4. Log audit
 * 5. Return updated timesheet
 * 
 * NOTE: Rejected timesheets are NEVER queued for email
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

    const data = await request.json()
    const { reason } = data

    // Fetch timesheet
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
    const permissionKey = isBCBA ? 'bcbaTimesheets.reject' : 'timesheets.reject'
    const permission = userPermissions[permissionKey]
    
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
    const hasPermission = isAdmin || (permission?.canApprove === true) // Reject uses canApprove

    if (!hasPermission) {
      console.error('[REJECT TIMESHEET] Permission denied:', {
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
          message: 'Permission denied - Insufficient permissions to reject timesheets',
        },
        { status: 403 }
      )
    }

    // Only DRAFT timesheets can be rejected
    if (timesheet.status !== 'DRAFT') {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: `Only draft timesheets can be rejected. Current status: ${timesheet.status}`,
        },
        { status: 400 }
      )
    }

    // Update timesheet to REJECTED
    const timesheetId = resolvedParams.id // Store in const for TypeScript
    const updated = await prisma.timesheet.update({
      where: { id: timesheetId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason?.trim() || null,
      },
    })

    // Log audit (non-blocking)
    try {
      const auditAction = isBCBA ? 'BCBA_TIMESHEET_REJECTED' : 'TIMESHEET_REJECTED'
      await prisma.auditLog.create({
        data: {
          action: auditAction as any,
          entityType: isBCBA ? 'BCBATimesheet' : 'Timesheet',
          entityId: timesheetId,
          userId: session.user.id,
          metadata: JSON.stringify({
            clientName: timesheet.client.name,
            providerName: timesheet.provider.name,
            bcbaName: timesheet.bcba.name,
            reason: reason?.trim() || 'No reason provided',
          }),
        },
      })

      await logReject(
        isBCBA ? 'BCBATimesheet' : 'Timesheet',
        timesheetId,
        session.user.id,
        reason?.trim()
      )
    } catch (auditError) {
      console.error('Failed to create audit log (non-blocking):', auditError)
    }

    return NextResponse.json({
      ok: true,
      data: updated,
    })
  } catch (error: any) {
    console.error('[REJECT TIMESHEET] Error:', {
      route: `/api/timesheets/${resolvedParams?.id || 'unknown'}/reject`,
      userId: session?.user?.id,
      userRole: session?.user?.role,
      timesheetId: resolvedParams?.id,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorStack: error?.stack,
    })
    return NextResponse.json(
      {
        ok: false,
        code: 'DB_ERROR',
        message: 'Failed to reject timesheet',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
