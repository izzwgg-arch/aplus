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
    const { clientId, month, year, rows, providerId } = body

    if (!clientId || !month || !year || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    // Use transaction
    const result = await prisma.$transaction(async (tx) => {
      // Do NOT overwrite existing saved forms: soft-delete previous record for same client+month+year, then create a new one.
      const existing = await tx.visitAttestation.findFirst({
        where: { clientId, month, year, deletedAt: null },
        select: { id: true },
      })
      if (existing) {
        await tx.visitAttestation.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        })
      }

      const effectiveProviderId = typeof providerId === 'string' ? providerId : ''

      const form = await tx.visitAttestation.create({
        data: {
          clientId,
          month,
          year,
          rows: {
            create: rows.map((row: any) => ({
              date: new Date(row.date),
              providerId: effectiveProviderId || row.providerId,
              parentSignature: row.parentSignature,
            })),
          },
        },
        include: { rows: true },
      })

      return form
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('Error creating visit attestation form:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save form' },
      { status: 500 }
    )
  }
}
