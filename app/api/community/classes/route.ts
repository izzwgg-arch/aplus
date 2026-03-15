import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessCommunitySection } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check Community Classes subsection permission
    const hasAccess = await canAccessCommunitySection(session.user.id, 'classes')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const classes = await prisma.communityClass.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    // Convert Decimal to number for JSON serialization
    const serializedClasses = classes.map(cls => ({
      ...cls,
      ratePerUnit: cls.ratePerUnit.toNumber(),
    }))

    return NextResponse.json(serializedClasses)
  } catch (error) {
    console.error('Error fetching community classes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch community classes' },
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
    const hasAccess = await canAccessCommunitySection(session.user.id, 'classes')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const data = await request.json()
    const { name, ratePerUnit, isActive } = data

    if (!name || ratePerUnit === undefined) {
      return NextResponse.json(
        { error: 'Name and rate per unit are required' },
        { status: 400 }
      )
    }

    const classItem = await prisma.communityClass.create({
      data: {
        name,
        ratePerUnit: parseFloat(ratePerUnit),
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json(classItem, { status: 201 })
  } catch (error) {
    console.error('Error creating community class:', error)
    return NextResponse.json(
      { error: 'Failed to create community class' },
      { status: 500 }
    )
  }
}
