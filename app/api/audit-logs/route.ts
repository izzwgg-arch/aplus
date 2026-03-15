import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN']

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !ADMIN_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const q = request.nextUrl.searchParams

    const page       = Math.max(1, parseInt(q.get('page')  || '1'))
    const limit      = Math.min(100, Math.max(10, parseInt(q.get('limit') || '100')))
    const action     = q.get('action')    || ''
    const entity     = q.get('entity')    || ''
    const entityId   = q.get('entityId')  || ''
    const userEmail  = q.get('userEmail') || ''
    const userId     = q.get('userId')    || ''
    const startDate  = q.get('startDate') || ''
    const endDate    = q.get('endDate')   || ''

    const where: any = {}

    if (action)   where.action     = action
    if (entity)   where.entityType = { contains: entity, mode: 'insensitive' }
    if (entityId) where.entityId   = entityId

    // Date range — parse as local midnight to avoid timezone shift dropping records
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        // e.g. "2026-02-13" → start of that day UTC
        where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`)
      }
      if (endDate) {
        // e.g. "2026-03-15" → end of that day UTC
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`)
      }
    }

    // User filter
    if (userId) {
      where.userId = userId
    } else if (userEmail) {
      // Search by partial email match through the User relation
      where.user = {
        email: { contains: userEmail.trim(), mode: 'insensitive' },
      }
    }

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, username: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    const parsedLogs = auditLogs.map((log) => {
      let oldValues: any = null
      let newValues: any = null
      let metadata:  any = null
      try { if (log.oldValues) oldValues = JSON.parse(log.oldValues) } catch {}
      try { if (log.newValues) newValues = JSON.parse(log.newValues) } catch {}
      try { if (log.metadata)  metadata  = JSON.parse(log.metadata)  } catch {}

      return {
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        userId: log.userId,
        createdAt: log.createdAt.toISOString(),
        oldValues,
        newValues,
        metadata,
        summary: '', // computed client-side for richer display
        user: log.user,
      }
    })

    return NextResponse.json({
      auditLogs: parsedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: any) {
    console.error('[audit-logs] error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
