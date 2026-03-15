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

    const bcbas = await prisma.bCBA.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(bcbas)
  } catch (error) {
    console.error('Error fetching BCBAs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch BCBAs' },
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
    const { name, email, phone, signature } = data

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const bcba = await prisma.bCBA.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        signature: signature || null,
      } as any,
    })

    return NextResponse.json(bcba, { status: 201 })
  } catch (error) {
    console.error('Error creating BCBA:', error)
    return NextResponse.json(
      { error: 'Failed to create BCBA' },
      { status: 500 }
    )
  }
}
