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

    const form = await prisma.parentTrainingSignIn.findFirst({
      where: { id: params.id, deletedAt: null },
      include: { client: { select: { id: true, name: true } }, rows: true },
    })

    if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(form)
  } catch (error) {
    console.error('Error fetching parent training sign-in form:', error)
    return NextResponse.json({ error: 'Failed to fetch form' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const permissions = await getUserPermissions(session.user.id)
    const canEdit = permissions['FORMS_EDIT']?.canView === true || 
                    session.user.role === 'ADMIN' || 
                    session.user.role === 'SUPER_ADMIN'

    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { clientId, month, year, rows } = body

    if (!clientId || !month || !year || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    // Use transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get existing row IDs to preserve
      const existingRowIds = rows.filter((r: any) => r.id).map((r: any) => r.id)
      
      // Delete rows that are no longer in the request
      await tx.parentTrainingSignInRow.deleteMany({
        where: {
          formId: params.id,
          id: { notIn: existingRowIds },
        },
      })

      // Update or create rows
      for (const row of rows) {
        if (row.id) {
          // Update existing row
          await tx.parentTrainingSignInRow.update({
            where: { id: row.id },
            data: {
              serviceDate: new Date(row.serviceDate),
              parentName: row.parentName,
              signature: row.signature,
            },
          })
        } else {
          // Create new row
          await tx.parentTrainingSignInRow.create({
            data: {
              formId: params.id,
              serviceDate: new Date(row.serviceDate),
              parentName: row.parentName,
              signature: row.signature,
            },
          })
        }
      }

      // Update form metadata
      const form = await tx.parentTrainingSignIn.update({
        where: { id: params.id },
        data: {
          clientId,
          month,
          year,
        },
        include: { rows: true },
      })

      return form
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error updating parent training sign-in form:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update form' },
      { status: 500 }
    )
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
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const existing = await prisma.parentTrainingSignIn.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true },
    })

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.parentTrainingSignIn.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting parent training sign-in form:', error)
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 })
  }
}
