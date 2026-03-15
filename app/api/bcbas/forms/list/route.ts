import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

type FormListItem = {
  id: string
  type: 'parent-training-sign-in' | 'parent-abc-data' | 'visit-attestation'
  clientId: string
  clientName: string
  month: number
  year: number
  createdAt: string
}

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

    const [pt, abc, va] = await Promise.all([
      prisma.parentTrainingSignIn.findMany({
        where: { deletedAt: null },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.parentABCData.findMany({
        where: { deletedAt: null },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.visitAttestation.findMany({
        where: { deletedAt: null },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    const items: FormListItem[] = [
      ...pt.map((f) => ({
        id: f.id,
        type: 'parent-training-sign-in' as const,
        clientId: f.clientId,
        clientName: f.client.name,
        month: f.month,
        year: f.year,
        createdAt: f.createdAt.toISOString(),
      })),
      ...abc.map((f) => ({
        id: f.id,
        type: 'parent-abc-data' as const,
        clientId: f.clientId,
        clientName: f.client.name,
        month: f.month,
        year: f.year,
        createdAt: f.createdAt.toISOString(),
      })),
      ...va.map((f) => ({
        id: f.id,
        type: 'visit-attestation' as const,
        clientId: f.clientId,
        clientName: f.client.name,
        month: f.month,
        year: f.year,
        createdAt: f.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error listing BCBA forms:', error)
    return NextResponse.json({ error: 'Failed to list forms' }, { status: 500 })
  }
}

