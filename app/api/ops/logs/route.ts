/**
 * /api/ops/logs
 * GET  - paginated, filtered log query
 * Admin-only.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)

  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || String(PAGE_SIZE))))
  const skip = (page - 1) * limit

  // Filters
  const level = searchParams.get('level') || undefined
  const category = searchParams.get('category') || undefined
  const source = searchParams.get('source') || undefined
  const eventType = searchParams.get('eventType') || undefined
  const status = searchParams.get('status') || undefined
  const actorUserId = searchParams.get('actorUserId') || undefined
  const search = searchParams.get('search') || undefined
  const fromDate = searchParams.get('from') || undefined
  const toDate = searchParams.get('to') || undefined

  // Build where clause
  const where: any = {}

  if (level) where.level = level
  if (category) where.category = category
  if (source) where.source = { contains: source, mode: 'insensitive' }
  if (eventType) where.eventType = { contains: eventType, mode: 'insensitive' }
  if (status) where.status = status
  if (actorUserId) where.actorUserId = actorUserId

  if (fromDate || toDate) {
    where.timestamp = {}
    if (fromDate) where.timestamp.gte = new Date(fromDate)
    if (toDate) where.timestamp.lte = new Date(toDate)
  }

  if (search) {
    where.OR = [
      { message: { contains: search, mode: 'insensitive' } },
      { eventType: { contains: search, mode: 'insensitive' } },
      { source: { contains: search, mode: 'insensitive' } },
      { actorEmail: { contains: search, mode: 'insensitive' } },
      { route: { contains: search, mode: 'insensitive' } },
    ]
  }

  try {
    const [logs, total] = await Promise.all([
      prisma.appEventLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          timestamp: true,
          level: true,
          category: true,
          source: true,
          eventType: true,
          message: true,
          actorUserId: true,
          actorEmail: true,
          actorRole: true,
          route: true,
          ipAddress: true,
          targetType: true,
          targetId: true,
          correlationId: true,
          status: true,
          // metadata excluded from list view for performance
        },
      }),
      prisma.appEventLog.count({ where }),
    ])

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
