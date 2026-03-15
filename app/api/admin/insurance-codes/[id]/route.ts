import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseDateOnlyToUTC } from '@/lib/insuranceCodes/dateOnly'

const requireAdmin = async () => {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
    return null
  }
  return session
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const updateData: any = {}

    if (data.cptCode !== undefined) updateData.cptCode = data.cptCode?.trim()
    if (data.codeName !== undefined) updateData.codeName = data.codeName?.trim()
    if (data.serviceType !== undefined) updateData.serviceType = data.serviceType
    if (data.appliesTo !== undefined) updateData.appliesTo = data.appliesTo
    if (data.startDate !== undefined) updateData.startDate = parseDateOnlyToUTC(data.startDate)
    if (data.endDate !== undefined) updateData.endDate = parseDateOnlyToUTC(data.endDate)
    if (data.authorizedUnits !== undefined) updateData.authorizedUnits = Number(data.authorizedUnits)
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive)
    if (data.clientId !== undefined) updateData.clientId = data.clientId
    if (data.insuranceId !== undefined) updateData.insuranceId = data.insuranceId

    if (updateData.authorizedUnits !== undefined) {
      if (!Number.isFinite(updateData.authorizedUnits) || updateData.authorizedUnits <= 0 || !Number.isInteger(updateData.authorizedUnits)) {
        return NextResponse.json({ error: 'Authorized units must be a positive integer' }, { status: 400 })
      }
    }

    if (updateData.startDate || updateData.endDate) {
      const start = updateData.startDate ? new Date(updateData.startDate) : undefined
      const end = updateData.endDate ? new Date(updateData.endDate) : undefined
      if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
        return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
      }
      if (start && end && end < start) {
        return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
      }
    }

    const updated = await prisma.insuranceCodeAuthorization.update({
      where: { id: params.id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true } },
        insurance: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating insurance code:', error)
    return NextResponse.json({ error: 'Failed to update insurance code' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updated = await prisma.insuranceCodeAuthorization.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error deleting insurance code:', error)
    return NextResponse.json({ error: 'Failed to delete insurance code' }, { status: 500 })
  }
}
