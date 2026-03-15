import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateTemporaryPassword } from '@/lib/security'
import { sendMailSafe, getNewUserInviteEmailHtml, getNewUserInviteEmailText } from '@/lib/email'
import { logCreate } from '@/lib/audit'

/**
 * POST /api/users/:id/resend-invite
 * Resend invitation email with new temporary password
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const session = await getServerSession(authOptions)
    
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Unauthorized - Admin access required',
        },
        { status: 401 }
      )
    }

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: resolvedParams.id },
      select: {
        id: true,
        username: true,
        email: true,
        active: true,
        deletedAt: true,
      },
    })

    if (!user || user.deletedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: 'NOT_FOUND',
          message: 'User not found',
        },
        { status: 404 }
      )
    }

    // Generate new temp password
    const tempPassword = generateTemporaryPassword()
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10)
    
    // Set temp password expiration (72 hours from now)
    const tempPasswordExpiresAt = new Date()
    const ttlHours = parseInt(process.env.TEMP_PASSWORD_TTL_HOURS || '72')
    tempPasswordExpiresAt.setHours(tempPasswordExpiresAt.getHours() + ttlHours)

    // Update user with new temp password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tempPasswordHash,
        tempPasswordExpiresAt,
        mustChangePassword: true,
      },
    })

    // Log audit
    await logCreate('User', user.id, session.user.id, {
      action: 'invite_resent',
      email: user.email,
      tempPasswordGenerated: true,
    })

    // Send invite email
    let emailSent = false
    try {
      const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://66.94.105.43:3000'
      const loginUrl = `${baseUrl}/login`
      
      const emailResult = await sendMailSafe({
        to: user.email,
        subject: 'Your Smart Steps ABA temporary password',
        html: getNewUserInviteEmailHtml(user.email, tempPassword, loginUrl, user.username),
        text: getNewUserInviteEmailText(user.email, tempPassword, loginUrl),
      }, {
        action: 'INVITE_RESENT',
        entityType: 'User',
        entityId: user.id,
        userId: session.user.id,
      })

      if (emailResult.success) {
        emailSent = true
        await logCreate('User', user.id, session.user.id, {
          action: 'invite_email_sent',
          email: user.email,
        })
      } else {
        console.error('[RESEND INVITE] Failed to send email:', emailResult.error)
        await logCreate('User', user.id, session.user.id, {
          action: 'invite_email_failed',
          email: user.email,
          error: emailResult.error,
        })
      }
    } catch (error: any) {
      console.error('[RESEND INVITE] Exception sending email:', {
        userId: user.id,
        email: user.email,
        error: error.message,
        stack: error.stack,
      })
      await logCreate('User', user.id, session.user.id, {
        action: 'invite_email_failed',
        email: user.email,
        error: error.message || 'Unknown error',
      })
    }

    return NextResponse.json({
      ok: true,
      emailSent,
      message: emailSent 
        ? 'Invitation email sent successfully' 
        : 'User updated, but invitation email failed. Please check SMTP configuration.',
    })
  } catch (error: any) {
    console.error('[RESEND INVITE] Error:', {
      error: error.message,
      stack: error.stack,
    })
    return NextResponse.json(
      {
        ok: false,
        code: 'DB_ERROR',
        message: 'Failed to resend invitation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
