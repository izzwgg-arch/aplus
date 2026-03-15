import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bcba = await prisma.bCBA.findUnique({
      where: { id: params.id },
    })

    if (!bcba || bcba.deletedAt) {
      return NextResponse.json({ error: 'BCBA not found' }, { status: 404 })
    }

    return NextResponse.json(bcba)
  } catch (error) {
    console.error('Error fetching BCBA:', error)
    return NextResponse.json(
      { error: 'Failed to fetch BCBA' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const { name, email, phone, signature } = data

    const bcba = await prisma.bCBA.update({
      where: { id: params.id },
      data: {
        name,
        email: email || null,
        phone: phone || null,
        ...(signature !== undefined && { signature: signature || null }),
      } as any,
    })

    return NextResponse.json(bcba)
  } catch (error) {
    console.error('Error updating BCBA:', error)
    return NextResponse.json(
      { error: 'Failed to update BCBA' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.bCBA.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting BCBA:', error)
    return NextResponse.json(
      { error: 'Failed to delete BCBA' },
      { status: 500 }
    )
  }
}
