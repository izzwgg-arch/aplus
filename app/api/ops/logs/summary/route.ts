/**
 * /api/ops/logs/summary
 * GET - counts by level/category for Overview cards
 * Admin-only. Lightweight query.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const since1h = new Date(Date.now() - 60 * 60 * 1000)

  try {
    const [
      errorsLast24h,
      criticalLast24h,
      securityLast24h,
      breachLast24h,
      authFailLast1h,
      totalLogs,
    ] = await Promise.all([
      prisma.appEventLog.count({ where: { level: 'error', timestamp: { gte: since24h } } }),
      prisma.appEventLog.count({ where: { level: 'critical', timestamp: { gte: since24h } } }),
      prisma.appEventLog.count({ where: { category: 'SECURITY', timestamp: { gte: since24h } } }),
      prisma.appEventLog.count({ where: { category: 'BREACH', timestamp: { gte: since24h } } }),
      prisma.appEventLog.count({
        where: {
          category: 'AUTH',
          eventType: { contains: 'FAIL' },
          timestamp: { gte: since1h },
        },
      }),
      prisma.appEventLog.count(),
    ])

    return NextResponse.json({
      errorsLast24h,
      criticalLast24h,
      securityLast24h,
      breachLast24h,
      authFailLast1h,
      totalLogs,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
