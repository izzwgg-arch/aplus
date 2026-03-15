import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const permissions = await getUserPermissions(session.user.id)
    const canView =
      permissions['FORMS_VIEW']?.canView === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const form = await prisma.formDocument.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        client: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
      },
    })

    if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(form)
  } catch (error) {
    console.error('Error fetching form by id:', error)
    return NextResponse.json({ error: 'Failed to fetch form' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const permissions = await getUserPermissions(session.user.id)
    const canDelete =
      permissions['FORMS_EDIT']?.canDelete === true ||
      permissions['FORMS_EDIT']?.canView === true || // allow delete for editors (system doesn't have granular delete toggles)
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const existing = await prisma.formDocument.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.formDocument.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting form:', error)
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 })
  }
}

