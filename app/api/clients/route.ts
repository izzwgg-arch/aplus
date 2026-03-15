import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clients = await prisma.client.findMany({
      where: { deletedAt: null },
      include: { insurance: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(clients)
  } catch (error) {
    console.error('Error fetching clients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
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

    const data = await request.json()
    const { name, email, phone, insuranceId, active, signature } = data

    if (!name || !insuranceId) {
      return NextResponse.json(
        { error: 'Name and Insurance are required' },
        { status: 400 }
      )
    }

    const client = await prisma.client.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        insuranceId,
        active: active !== undefined ? active : true,
        signature: signature || null,
      },
      include: { insurance: true },
    })

    // Audit log: client created
    try {
      await createAuditLog({
        action: 'CREATE',
        entityType: 'Client',
        entityId: client.id,
        userId: session.user.id,
        newValues: { name: client.name, email: client.email },
      })
    } catch {}

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('Error creating client:', error)
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    )
  }
}
