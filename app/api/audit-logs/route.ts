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

    const searchParams = request.nextUrl.searchParams
    const page    = Math.max(1, parseInt(searchParams.get('page')  || '1'))
    const limit   = Math.min(100, parseInt(searchParams.get('limit') || '50'))
    const action  = searchParams.get('action')   || ''
    const entity  = searchParams.get('entity')   || ''  // maps to entityType
    const entityId = searchParams.get('entityId') || ''
    const userEmail = searchParams.get('userEmail') || ''
    const userId  = searchParams.get('userId')   || ''
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')

    const where: any = {}

    if (action)    where.action     = action
    if (entity)    where.entityType = { contains: entity, mode: 'insensitive' }
    if (entityId)  where.entityId   = entityId

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) {
        // include the full end day
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    // User filter: by ID or by email search
    if (userId) {
      where.userId = userId
    } else if (userEmail) {
      where.user = {
        email: { contains: userEmail, mode: 'insensitive' },
      }
    }

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              role: true,
            },
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
      let metadata: any = null

      try { if (log.oldValues) oldValues = JSON.parse(log.oldValues) } catch {}
      try { if (log.newValues) newValues = JSON.parse(log.newValues) } catch {}
      try { if (log.metadata)  metadata  = JSON.parse(log.metadata)  } catch {}

      // Derive a human-readable summary of what changed
      let summary = ''
      if (log.action === 'LOGIN') {
        summary = `User logged in${metadata?.usingTempPassword ? ' (temp password)' : ''}`
      } else if (oldValues && newValues) {
        const changedFields = Object.keys(newValues).filter(
          k => JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k])
        )
        summary = changedFields.length > 0
          ? `Changed: ${changedFields.join(', ')}`
          : `Updated ${log.entityType}`
      } else if (newValues) {
        summary = `Created ${log.entityType}`
      } else if (oldValues) {
        summary = `Deleted ${log.entityType}`
      } else if (metadata) {
        const keys = Object.keys(metadata).filter(k => k !== 'timestamp')
        summary = keys.slice(0, 3).map(k => `${k}: ${String(metadata[k]).substring(0, 30)}`).join(', ')
      }

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
        summary,
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
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
