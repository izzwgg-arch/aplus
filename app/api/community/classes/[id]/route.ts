import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessCommunitySection } from '@/lib/permissions'

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
    const hasAccess = await canAccessCommunitySection(session.user.id, 'classes')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const classItem = await prisma.communityClass.findUnique({
      where: { id: resolvedParams.id },
    })

    if (!classItem || classItem.deletedAt) {
      return NextResponse.json({ error: 'Community class not found' }, { status: 404 })
    }

    return NextResponse.json(classItem)
  } catch (error) {
    console.error('Error fetching community class:', error)
    return NextResponse.json(
      { error: 'Failed to fetch community class' },
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
    const hasAccess = await canAccessCommunitySection(session.user.id, 'classes')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const data = await request.json()
    const { name, ratePerUnit, isActive } = data

    const classItem = await prisma.communityClass.update({
      where: { id: resolvedParams.id },
      data: {
        name,
        ratePerUnit: ratePerUnit !== undefined ? parseFloat(ratePerUnit) : undefined,
        isActive,
      },
    })

    return NextResponse.json(classItem)
  } catch (error) {
    console.error('Error updating community class:', error)
    return NextResponse.json(
      { error: 'Failed to update community class' },
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
    const hasAccess = await canAccessCommunitySection(session.user.id, 'classes')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    await prisma.communityClass.update({
      where: { id: resolvedParams.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting community class:', error)
    return NextResponse.json(
      { error: 'Failed to delete community class' },
      { status: 500 }
    )
  }
}
