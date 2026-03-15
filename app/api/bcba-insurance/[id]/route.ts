import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { getUserPermissions } from '@/lib/permissions'

/**
 * GET /api/bcba-insurance/[id]
 * Get single BCBA insurance record
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await getUserPermissions(session.user.id)
    const canView = 
      permissions['bcbaInsurance.view']?.canView === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canView) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    const insurance = await (prisma as any).bcbaInsurance.findUnique({
      where: { id: params.id },
    })

    if (!insurance) {
      return NextResponse.json(
        { error: 'BCBA Insurance not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...insurance,
      ratePerUnit: typeof insurance.ratePerUnit === 'object' && 'toNumber' in insurance.ratePerUnit
        ? insurance.ratePerUnit.toNumber()
        : Number(insurance.ratePerUnit) || 0,
    })
  } catch (error: any) {
    console.error('[BCBA INSURANCE] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch BCBA insurance', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/bcba-insurance/[id]
 * Update BCBA insurance record
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await getUserPermissions(session.user.id)
    const canUpdate = 
      permissions['bcbaInsurance.manage']?.canUpdate === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canUpdate) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, ratePerUnit, unitMinutes, active, notes } = body

    if (!name || ratePerUnit === undefined) {
      return NextResponse.json(
        { error: 'Name and rate per unit are required' },
        { status: 400 }
      )
    }

    const insurance = await (prisma as any).bcbaInsurance.update({
      where: { id: params.id },
      data: {
        name: name.trim(),
        ratePerUnit: new Decimal(ratePerUnit),
        unitMinutes: unitMinutes || 15,
        active: active !== false,
        notes: notes || null,
      },
    })

    return NextResponse.json({
      ...insurance,
      ratePerUnit: typeof insurance.ratePerUnit === 'object' && 'toNumber' in insurance.ratePerUnit
        ? insurance.ratePerUnit.toNumber()
        : Number(insurance.ratePerUnit) || 0,
    })
  } catch (error: any) {
    console.error('[BCBA INSURANCE] Error:', error)
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'BCBA Insurance not found' },
        { status: 404 }
      )
    }
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'BCBA Insurance with this name already exists' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to update BCBA insurance', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/bcba-insurance/[id]
 * Delete BCBA insurance record (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await getUserPermissions(session.user.id)
    const canDelete = 
      permissions['bcbaInsurance.manage']?.canDelete === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canDelete) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    await (prisma as any).bcbaInsurance.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BCBA INSURANCE] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete BCBA insurance', details: error.message },
      { status: 500 }
    )
  }
}
