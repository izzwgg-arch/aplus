import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashToken } from '@/lib/security'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const entityId = searchParams.get('id')
    const token = searchParams.get('token')

    if (!entityId || !token) {
      return NextResponse.json({ error: 'Missing signature link parameters' }, { status: 400 })
    }

    const tokenHash = hashToken(token)
    const tokenRecord = await prisma.signatureRequestToken.findFirst({
      where: {
        entityId,
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    })

    if (!tokenRecord) {
      return NextResponse.json({ error: 'Signature link is invalid or expired' }, { status: 400 })
    }

    const entity =
      tokenRecord.entityType === 'CLIENT'
        ? await prisma.client.findFirst({
            where: { id: entityId, deletedAt: null },
            select: { name: true },
          })
        : await prisma.provider.findFirst({
            where: { id: entityId, deletedAt: null },
            select: { name: true },
          })

    if (!entity) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }

    return NextResponse.json({
      entityType: tokenRecord.entityType,
      name: entity.name,
    })
  } catch (error) {
    console.error('Error validating signature token:', error)
    return NextResponse.json({ error: 'Failed to validate signature link' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entityId = body?.id as string
    const token = body?.token as string
    const signature = body?.signature as string

    if (!entityId || !token || !signature) {
      return NextResponse.json({ error: 'Missing signature submission data' }, { status: 400 })
    }

    const tokenHash = hashToken(token)
    const tokenRecord = await prisma.signatureRequestToken.findFirst({
      where: {
        entityId,
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    })

    if (!tokenRecord) {
      return NextResponse.json({ error: 'Signature link is invalid or expired' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      if (tokenRecord.entityType === 'CLIENT') {
        const client = await tx.client.findFirst({
          where: { id: entityId, deletedAt: null },
          select: { id: true },
        })
        if (!client) {
          throw new Error('Recipient not found')
        }
        await tx.client.update({
          where: { id: entityId },
          data: {
            signature,
            signatureUpdatedAt: new Date(),
          },
        })
      } else {
        const provider = await tx.provider.findFirst({
          where: { id: entityId, deletedAt: null },
          select: { id: true },
        })
        if (!provider) {
          throw new Error('Recipient not found')
        }
        await tx.provider.update({
          where: { id: entityId },
          data: {
            signature,
            signatureUpdatedAt: new Date(),
          },
        })
      }

      await tx.signatureRequestToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error submitting signature:', error)
    return NextResponse.json({ error: 'Failed to submit signature' }, { status: 500 })
  }
}
