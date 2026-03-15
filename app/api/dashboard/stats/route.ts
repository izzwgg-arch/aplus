import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTimesheetVisibilityScope } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

    // Get unread activity count (only for admins)
    // Count audit logs created since last seen (using AuditLog instead of Activity)
    let unreadActivityCount = 0
    if (isAdmin) {
      const admin = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastSeenActivityAt: true },
      })
      const lastSeenAt = admin?.lastSeenActivityAt
      const whereClause = lastSeenAt
        ? { createdAt: { gt: lastSeenAt } }
        : {}
      unreadActivityCount = await prisma.auditLog.count({
        where: whereClause,
      })
    }

    // Get pending timesheets (DRAFT status - ready for approval)
    // Apply timesheet visibility scope
    const visibilityScope = await getTimesheetVisibilityScope(userId)
    
    const pendingTimesheetsWhere: any = {
      status: 'DRAFT' as const,
      deletedAt: null,
    }
    
    if (!visibilityScope.viewAll) {
      pendingTimesheetsWhere.userId = { in: visibilityScope.allowedUserIds }
    }

    const pendingTimesheets = await prisma.timesheet.findMany({
      where: pendingTimesheetsWhere,
      include: {
        client: { select: { name: true } },
        provider: { select: { name: true } },
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    // Get recent activity (audit logs including login events)
    // For admins: include all audit logs including LOGIN actions
    // For non-admins: only their own audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: isAdmin ? {} : { userId },
      include: {
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // Get more to filter and sort
    })

    // Transform audit logs to activity format
    // Include LOGIN actions as login activities for admins
    const allActivities = auditLogs.map((log) => {
      const isLoginAction = log.action === 'LOGIN'
      return {
        id: log.id,
        type: isLoginAction ? ('login' as const) : ('audit' as const),
        action: log.action,
        entity: log.entityType, // Use entityType from schema
        entityId: log.entityId,
        userEmail: log.user.email,
        createdAt: log.createdAt,
        oldValues: log.oldValues ? JSON.parse(log.oldValues) : null,
        newValues: log.newValues ? JSON.parse(log.newValues) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }
    })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)

    const recentActivity = allActivities.map((activity) => ({
      id: activity.id,
      action: activity.action,
      entity: activity.entity,
      entityId: activity.entityId,
      userEmail: activity.userEmail,
      createdAt: activity.createdAt instanceof Date ? activity.createdAt.toISOString() : activity.createdAt,
      oldValues: activity.oldValues,
      newValues: activity.newValues,
    }))

    // Get unread notifications count
    const unreadNotificationsCount = await prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    })

    // Get quick stats
    const statsWhere = isAdmin ? {} : { userId }

    const [
      totalTimesheets,
      draftTimesheets,
      submittedTimesheets,
      approvedTimesheets,
      totalInvoices,
      draftInvoices,
      totalBilled,
      totalPaid,
      totalOutstanding,
    ] = await Promise.all([
      // Timesheet counts
      prisma.timesheet.count({
        where: { ...statsWhere, deletedAt: null },
      }),
      prisma.timesheet.count({
        where: { ...statsWhere, status: 'DRAFT', deletedAt: null },
      }),
      prisma.timesheet.count({
        where: { ...statsWhere, status: 'DRAFT', deletedAt: null },
      }),
      prisma.timesheet.count({
        where: { 
          ...statsWhere, 
          status: { in: ['APPROVED', 'QUEUED', 'EMAILED'] }, 
          deletedAt: null 
        },
      }),
      // Invoice counts
      prisma.invoice.count({
        where: { deletedAt: null },
      }),
      prisma.invoice.count({
        where: { status: 'DRAFT', deletedAt: null },
      }),
      // Financial totals
      prisma.invoice.aggregate({
        where: { deletedAt: null },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.aggregate({
        where: { deletedAt: null },
        _sum: { paidAmount: true },
      }),
      prisma.invoice.aggregate({
        where: { deletedAt: null },
        _sum: { outstanding: true },
      }),
    ])

    // Get recent invoices
    const recentInvoices = await prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    return NextResponse.json({
      stats: {
        timesheets: {
          total: totalTimesheets,
          draft: draftTimesheets,
          submitted: submittedTimesheets,
          approved: approvedTimesheets,
        },
        invoices: {
          total: totalInvoices,
          draft: draftInvoices,
        },
        financial: {
          totalBilled: parseFloat(totalBilled._sum.totalAmount?.toString() || '0'),
          totalPaid: parseFloat(totalPaid._sum.paidAmount?.toString() || '0'),
          totalOutstanding: parseFloat(totalOutstanding._sum.outstanding?.toString() || '0'),
        },
      },
      pendingTimesheets,
      recentActivity,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.client.name,
        status: inv.status,
        totalAmount: parseFloat(inv.totalAmount.toString()),
        createdAt: inv.createdAt,
      })),
      unreadNotificationsCount,
      unreadActivityCount: isAdmin ? unreadActivityCount : 0,
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
