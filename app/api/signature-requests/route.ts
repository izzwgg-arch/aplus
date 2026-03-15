import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecureToken, hashToken } from '@/lib/security'
import { sendMailSafe } from '@/lib/email'

const SIGNATURE_LINK_TTL_DAYS = 7

export async function POST(request: NextRequest) {
  let session: any = null
  try {
    session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const entityType = (body?.entityType || '').toUpperCase()
    const entityId = body?.entityId as string

    if (!entityId || (entityType !== 'CLIENT' && entityType !== 'PROVIDER')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const entity =
      entityType === 'CLIENT'
        ? await prisma.client.findFirst({
            where: { id: entityId, deletedAt: null },
            select: { id: true, name: true, email: true },
          })
        : await prisma.provider.findFirst({
            where: { id: entityId, deletedAt: null },
            select: { id: true, name: true, email: true },
          })

    if (!entity) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }

    if (!entity.email) {
      return NextResponse.json({ error: 'Recipient email is missing' }, { status: 400 })
    }

    const token = generateSecureToken(32)
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + SIGNATURE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000)

    await prisma.signatureRequestToken.create({
      data: {
        entityType: entityType === 'CLIENT' ? 'CLIENT' : 'PROVIDER',
        entityId,
        email: entity.email,
        tokenHash,
        expiresAt,
        createdByUserId: session.user.id,
      },
    })

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000'
    const signatureLink = `${baseUrl}/portal/sign?id=${entityId}&token=${token}`

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Signature Request</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin-top: 0;">Smart Steps</h1>
        </div>
        <div style="background-color: #ffffff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Signature Request</h2>
          <p>Hello ${entity.name},</p>
          <p>Please provide your signature using the secure link below.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signatureLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Provide Signature</a>
          </div>
          <p style="font-size: 12px; color: #6b7280;">
            This link will expire in ${SIGNATURE_LINK_TTL_DAYS} days.
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Smart Steps. All rights reserved.</p>
        </div>
      </body>
      </html>
    `

    const emailResult = await sendMailSafe(
      {
        to: entity.email,
        subject: 'Signature Request from Smart Steps',
        html,
      },
      {
        action: 'SIGNATURE_REQUEST',
        entityType: entityType,
        entityId,
        userId: session.user.id,
      }
    )

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error sending signature request:', error)
    return NextResponse.json({ error: 'Failed to send signature request' }, { status: 500 })
  }
}
