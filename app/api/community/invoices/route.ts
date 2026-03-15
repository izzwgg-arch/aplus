import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessCommunitySection } from '@/lib/permissions'
import { parseDateOnly } from '@/lib/dateUtils'
import { createAuditLog } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check Community Classes subsection permission
    const hasAccess = await canAccessCommunitySection(session.user.id, 'invoices')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const invoices = await prisma.communityInvoice.findMany({
      where: { deletedAt: null },
      include: {
        client: true,
        class: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Convert Decimal to number for JSON serialization
    const serializedInvoices = invoices.map(invoice => ({
      ...invoice,
      ratePerUnit: invoice.ratePerUnit.toNumber(),
      totalAmount: invoice.totalAmount.toNumber(),
      class: {
        ...invoice.class,
        ratePerUnit: invoice.class.ratePerUnit.toNumber(),
      },
    }))

    return NextResponse.json(serializedInvoices)
  } catch (error) {
    console.error('Error fetching community invoices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch community invoices' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check Community Classes subsection permission
    const hasAccess = await canAccessCommunitySection(session.user.id, 'invoices')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const data = await request.json()
    const { clientId, classId, units, serviceDate, notes } = data

    if (!clientId || !classId || !units || units <= 0) {
      return NextResponse.json(
        { error: 'Client, class, and units (positive number) are required' },
        { status: 400 }
      )
    }

    // Fetch class to get current rate
    const classItem = await prisma.communityClass.findUnique({
      where: { id: classId },
    })

    if (!classItem || classItem.deletedAt) {
      return NextResponse.json(
        { error: 'Community class not found' },
        { status: 404 }
      )
    }

    const ratePerUnit = classItem.ratePerUnit
    const totalAmount = ratePerUnit.toNumber() * units

    const invoice = await prisma.communityInvoice.create({
      data: {
        clientId,
        classId,
        units,
        ratePerUnit,
        totalAmount,
        // Parse date as date-only in America/New_York timezone to avoid timezone shifts
        // This ensures the date entered (e.g., 01/04/2026) is stored and displayed as the same date
        serviceDate: serviceDate ? parseDateOnly(serviceDate, 'America/New_York') : null,
        notes: notes || null,
        status: 'DRAFT',
        createdByUserId: session.user.id,
      },
      include: {
        client: true,
        class: true,
      },
    })

    // Convert Decimal to number for JSON serialization
    const serializedInvoice = {
      ...invoice,
      ratePerUnit: invoice.ratePerUnit.toNumber(),
      totalAmount: invoice.totalAmount.toNumber(),
      class: {
        ...invoice.class,
        ratePerUnit: invoice.class.ratePerUnit.toNumber(),
      },
    }

    // Audit log: community invoice created
    try {
      await createAuditLog({
        action: 'CREATE',
        entityType: 'CommunityInvoice',
        entityId: serializedInvoice?.id || 'unknown',
        userId: session.user.id,
        newValues: { status: 'CREATED' },
      })
    } catch {}

    return NextResponse.json(serializedInvoice, { status: 201 })
  } catch (error) {
    console.error('Error creating community invoice:', error)
    return NextResponse.json(
      { error: 'Failed to create community invoice' },
      { status: 500 }
    )
  }
}
