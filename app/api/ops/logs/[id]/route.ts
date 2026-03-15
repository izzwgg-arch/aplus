/**
 * /api/ops/logs/[id]
 * GET - single log entry with full metadata (admin only)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { id } = params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    const log = await prisma.appEventLog.findUnique({ where: { id } })
    if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(log)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
