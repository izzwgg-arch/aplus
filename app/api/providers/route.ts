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

    const providers = await prisma.provider.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(providers)
  } catch (error) {
    console.error('Error fetching providers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch providers' },
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
    const { name, email, phone, signature, active } = data

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const provider = await prisma.provider.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        signature: signature || null,
        active: active !== undefined ? active : true,
      },
    })

    // Audit log: provider created
    try {
      await createAuditLog({
        action: 'CREATE',
        entityType: 'Provider',
        entityId: provider.id,
        userId: session.user.id,
        newValues: { name: provider.name, email: provider.email },
      })
    } catch {}

    return NextResponse.json(provider, { status: 201 })
  } catch (error) {
    console.error('Error creating provider:', error)
    return NextResponse.json(
      { error: 'Failed to create provider' },
      { status: 500 }
    )
  }
}
