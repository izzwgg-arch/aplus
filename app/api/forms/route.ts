import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

// GET - Fetch form by type, client, month, year, provider (optional)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const permissions = await getUserPermissions(session.user.id)
    const canView = permissions['FORMS_VIEW']?.canView === true || 
                    session.user.role === 'ADMIN' || 
                    session.user.role === 'SUPER_ADMIN'

    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const clientId = searchParams.get('clientId')
    const month = searchParams.get('month')
    const yearParam = searchParams.get('year')
    const providerId = searchParams.get('providerId')

    if (!type || !clientId || !month) {
      return NextResponse.json(
        { error: 'type, clientId, and month are required' },
        { status: 400 }
      )
    }

    // Use current year if not provided
    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear()

    const where: any = {
      type: type as any,
      clientId,
      month: parseInt(month),
      year: year,
      deletedAt: null,
    }

    // For VISIT_ATTESTATION, providerId is required
    if (type === 'VISIT_ATTESTATION') {
      if (!providerId) {
        return NextResponse.json(
          { error: 'providerId is required for VISIT_ATTESTATION' },
          { status: 400 }
        )
      }
      where.providerId = providerId
    } else {
      // For other forms, providerId should be null
      where.providerId = null
    }

    const form = await prisma.formDocument.findFirst({
      where,
      include: {
        client: {
          select: { id: true, name: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json(form || null)
  } catch (error: any) {
    console.error('Error fetching form:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch form' },
      { status: 500 }
    )
  }
}

// POST/PUT - Upsert form document
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { type, clientId, providerId, month, year: yearParam, behavior, payload } = body

    if (!type || !clientId || !month || !payload) {
      return NextResponse.json(
        { error: 'type, clientId, month, and payload are required' },
        { status: 400 }
      )
    }

    // Use current year if not provided
    const year = yearParam || new Date().getFullYear()

    // Validate providerId for VISIT_ATTESTATION
    if (type === 'VISIT_ATTESTATION' && !providerId) {
      return NextResponse.json(
        { error: 'providerId is required for VISIT_ATTESTATION' },
        { status: 400 }
      )
    }

    // Build where clause for unique constraint
    const where: any = {
      type: type as any,
      clientId,
      month: parseInt(month),
      year: year,
      deletedAt: null,
    }

    if (type === 'VISIT_ATTESTATION') {
      where.providerId = providerId
    } else {
      where.providerId = null
    }

    // Find existing form first (Prisma doesn't support nulls in unique constraints well)
    const existing = await prisma.formDocument.findFirst({
      where: {
        type: type as any,
        clientId,
        providerId: type === 'VISIT_ATTESTATION' ? providerId! : null,
        month: parseInt(month),
        year: year,
        deletedAt: null,
      },
    })

    let form
    if (existing) {
      // Update existing
      form = await prisma.formDocument.update({
        where: { id: existing.id },
        data: {
          behavior: behavior || null,
          payload,
          updatedAt: new Date(),
        },
        include: {
          client: {
            select: { id: true, name: true },
          },
          provider: {
            select: { id: true, name: true },
          },
        },
      })
    } else {
      // Create new
      form = await prisma.formDocument.create({
        data: {
          type: type as any,
          clientId,
          providerId: type === 'VISIT_ATTESTATION' ? providerId! : null,
          month: parseInt(month),
          year: year,
          behavior: behavior || null,
          payload,
          createdById: session.user.id,
        },
        include: {
          client: {
            select: { id: true, name: true },
          },
          provider: {
            select: { id: true, name: true },
          },
        },
      })
    }

    return NextResponse.json(form, { status: 201 })
  } catch (error: any) {
    console.error('Error saving form:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save form' },
      { status: 500 }
    )
  }
}
