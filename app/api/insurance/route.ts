import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const insurances = await prisma.insurance.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(insurances)
  } catch (error) {
    console.error('Error fetching insurance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch insurance' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const { 
      name, 
      ratePerUnit, // Legacy field
      regularRatePerUnit, 
      regularUnitMinutes, 
      bcbaRatePerUnit, 
      bcbaUnitMinutes, 
      active 
    } = data

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Use regularRatePerUnit if provided, otherwise fallback to ratePerUnit (legacy)
    const finalRegularRate = regularRatePerUnit !== undefined && regularRatePerUnit !== null
      ? parseFloat(regularRatePerUnit)
      : (ratePerUnit !== undefined && ratePerUnit !== null ? parseFloat(ratePerUnit) : 0)
    
    const finalRegularMins = regularUnitMinutes !== undefined && regularUnitMinutes !== null
      ? parseInt(regularUnitMinutes)
      : 15

    // Use bcbaRatePerUnit if provided, otherwise fallback to regularRatePerUnit
    const finalBcbaRate = bcbaRatePerUnit !== undefined && bcbaRatePerUnit !== null
      ? parseFloat(bcbaRatePerUnit)
      : finalRegularRate
    
    const finalBcbaMins = bcbaUnitMinutes !== undefined && bcbaUnitMinutes !== null
      ? parseInt(bcbaUnitMinutes)
      : finalRegularMins

    // Create insurance
    const insurance = await (prisma as any).insurance.create({
      data: {
        name,
        ratePerUnit: finalRegularRate, // Keep for backward compatibility
        regularRatePerUnit: finalRegularRate,
        regularUnitMinutes: finalRegularMins,
        bcbaRatePerUnit: finalBcbaRate,
        bcbaUnitMinutes: finalBcbaMins,
        active: active !== undefined ? active : true,
      },
    })

    // Record rate history
    await prisma.insuranceRateHistory.create({
      data: {
        insuranceId: insurance.id,
        ratePerUnit: finalRegularRate,
        effectiveFrom: new Date(),
      },
    })

    return NextResponse.json(insurance, { status: 201 })
  } catch (error) {
    console.error('Error creating insurance:', error)
    return NextResponse.json(
      { error: 'Failed to create insurance' },
      { status: 500 }
    )
  }
}
