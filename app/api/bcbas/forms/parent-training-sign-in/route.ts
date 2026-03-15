import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const permissions = await getUserPermissions(session.user.id)
    const canCreate = permissions['FORMS_EDIT']?.canView === true || 
                      session.user.role === 'ADMIN' || 
                      session.user.role === 'SUPER_ADMIN'

    if (!canCreate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { clientId, month, year, rows } = body

    if (!clientId || !month || !year || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    // Use transaction to ensure all-or-nothing save
    const result = await prisma.$transaction(async (tx) => {
      // Check if form already exists for this client/month/year
      const existing = await tx.parentTrainingSignIn.findFirst({
        where: {
          clientId,
          month,
          year,
          deletedAt: null,
        },
      })

      let form
      if (existing) {
        // Update existing form - delete old rows and create new ones
        await tx.parentTrainingSignInRow.deleteMany({
          where: { formId: existing.id },
        })

        form = await tx.parentTrainingSignIn.update({
          where: { id: existing.id },
          data: {
            rows: {
              create: rows.map((row: any) => ({
                serviceDate: new Date(row.serviceDate),
                // Field kept in schema; UI no longer collects it.
                parentName: row.parentName || '',
                signature: row.signature,
              })),
            },
          },
          include: { rows: true },
        })
      } else {
        // Create new form
        form = await tx.parentTrainingSignIn.create({
          data: {
            clientId,
            month,
            year,
            rows: {
              create: rows.map((row: any) => ({
                serviceDate: new Date(row.serviceDate),
                parentName: row.parentName || '',
                signature: row.signature,
              })),
            },
          },
          include: { rows: true },
        })
      }

      return form
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Error creating parent training sign-in form:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save form' },
      { status: 500 }
    )
  }
}
