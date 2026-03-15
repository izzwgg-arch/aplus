import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const permissions = await getUserPermissions(session.user.id)
    const canView =
      permissions['FORMS_VIEW']?.canView === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const items = await prisma.formDocument.findMany({
      where: { deletedAt: null },
      include: {
        client: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    })

    return NextResponse.json({
      items: items.map((f) => ({
        id: f.id,
        type: f.type,
        clientId: f.clientId,
        clientName: f.client.name,
        providerId: f.providerId,
        providerName: f.provider?.name || null,
        month: f.month,
        year: f.year ?? null,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error listing forms:', error)
    return NextResponse.json({ error: 'Failed to list forms' }, { status: 500 })
  }
}

