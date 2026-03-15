import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const visibility = await prisma.roleDashboardVisibility.findMany({
      where: { roleId: params.id },
    })

    return NextResponse.json({ visibility })
  } catch (error) {
    console.error('Error fetching dashboard visibility:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard visibility' },
      { status: 500 }
    )
  }
}
