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
    const hasAccess = await canAccessCommunitySection(session.user.id, 'clients')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const client = await prisma.communityClient.findUnique({
      where: { id: resolvedParams.id },
    })

    if (!client || client.deletedAt) {
      return NextResponse.json({ error: 'Community client not found' }, { status: 404 })
    }

    return NextResponse.json(client)
  } catch (error) {
    console.error('Error fetching community client:', error)
    return NextResponse.json(
      { error: 'Failed to fetch community client' },
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
    const hasAccess = await canAccessCommunitySection(session.user.id, 'clients')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    const data = await request.json()
    const { firstName, lastName, email, phone, address, city, state, zipCode, medicaidId, status } = data

    const client = await prisma.communityClient.update({
      where: { id: resolvedParams.id },
      data: {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        medicaidId: medicaidId || null,
        status,
      },
    })

    return NextResponse.json(client)
  } catch (error) {
    console.error('Error updating community client:', error)
    return NextResponse.json(
      { error: 'Failed to update community client' },
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
    const hasAccess = await canAccessCommunitySection(session.user.id, 'clients')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    await prisma.communityClient.update({
      where: { id: resolvedParams.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting community client:', error)
    return NextResponse.json(
      { error: 'Failed to delete community client' },
      { status: 500 }
    )
  }
}
