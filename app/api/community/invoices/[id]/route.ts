import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessCommunitySection } from '@/lib/permissions'
import { parseDateOnly } from '@/lib/dateUtils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const hasAccess = await canAccessCommunitySection(session.user.id, 'invoices')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const invoice = await prisma.communityInvoice.findUnique({
      where: { id: resolvedParams.id },
      include: {
        client: true,
        class: true,
      },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json({ error: 'Community invoice not found' }, { status: 404 })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching community invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch community invoice' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const hasAccess = await canAccessCommunitySection(session.user.id, 'invoices')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    // Check if invoice exists and is DRAFT
    const existingInvoice = await prisma.communityInvoice.findUnique({
      where: { id: resolvedParams.id },
    })

    if (!existingInvoice || existingInvoice.deletedAt) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (existingInvoice.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only DRAFT invoices can be edited' },
        { status: 400 }
      )
    }

    const data = await request.json()
    const { units, serviceDate, notes } = data

    // If units changed, recalculate total
    let updateData: any = {
      units: units !== undefined ? parseInt(units) : existingInvoice.units,
      // Parse date as date-only in America/New_York timezone to avoid timezone shifts
      serviceDate: serviceDate ? parseDateOnly(serviceDate, 'America/New_York') : null,
      notes: notes || null,
    }

    // Recalculate total if units changed
    if (units !== undefined && units !== existingInvoice.units) {
      const classItem = await prisma.communityClass.findUnique({
        where: { id: existingInvoice.classId },
      })
      if (classItem) {
        updateData.totalAmount = classItem.ratePerUnit.toNumber() * parseInt(units)
      }
    }

    const invoice = await prisma.communityInvoice.update({
      where: { id: resolvedParams.id },
      data: updateData,
      include: {
        client: true,
        class: true,
      },
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error updating community invoice:', error)
    return NextResponse.json(
      { error: 'Failed to update community invoice' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const hasAccess = await canAccessCommunitySection(session.user.id, 'invoices')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    await prisma.communityInvoice.update({
      where: { id: resolvedParams.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting community invoice:', error)
    return NextResponse.json(
      { error: 'Failed to delete community invoice' },
      { status: 500 }
    )
  }
}
