import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMailSafe, getPasswordResetEmailHtml, getPasswordResetEmailText } from '@/lib/email'
import { hashToken, generateSecureToken, checkRateLimit } from '@/lib/security'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    console.log('[FORGOT_PASSWORD] Request received', {
      email: email ? email.toLowerCase().trim() : 'MISSING',
      timestamp: new Date().toISOString(),
    })

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Rate limiting: 5 requests per 15 minutes per IP
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const rateLimitKey = `forgot-password:${clientIp}:${email.toLowerCase().trim()}`
    
    if (!checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      console.warn('[FORGOT_PASSWORD] Rate limit exceeded', { email: email.toLowerCase().trim(), clientIp })
      return NextResponse.json(
        { error: 'Too many password reset requests. Please try again later.' },
        { status: 429 }
      )
    }

    // Find user by email (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim()
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    })

    console.log('[FORGOT_PASSWORD] User lookup', {
      email: email.toLowerCase().trim(),
      userFound: !!user,
      userActive: user?.active ?? false,
      userDeleted: !!user?.deletedAt,
    })

    // Don't reveal if user exists or not (security best practice)
    // Always return success message
    if (!user || user.deletedAt || !user.active) {
      // Still return success to prevent email enumeration
      console.log('[FORGOT_PASSWORD] User not found or inactive, returning success (security)')
      return NextResponse.json({
        message: 'If an account with that email exists, a password reset link has been sent.',
      })
    }

    // Generate reset token (plain text for email)
    const resetToken = generateSecureToken(32)
    // Hash token for storage
    const hashedToken = hashToken(resetToken)
    const resetTokenExpiry = new Date()
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1) // Token expires in 1 hour

    // Save hashed token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry,
      },
    })

    // Log audit
    await createAuditLog({
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      userId: 'system',
      newValues: {
        action: 'password_reset_requested',
        email: user.email,
      },
    })

    // Generate reset link
    const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`

    console.log('[FORGOT_PASSWORD] Token generated and saved', {
      userId: user.id,
      email: user.email,
      resetLink: `${baseUrl}/reset-password?token=***${resetToken.slice(-8)}`,
      expiresAt: resetTokenExpiry.toISOString(),
    })

    // Send email
    try {
      console.log('[FORGOT_PASSWORD] Attempting to send email', {
        to: user.email,
        from: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'NOT SET',
      })

      const emailResult = await sendMailSafe({
        to: user.email,
        subject: 'Password Reset Request - Smart Steps',
        html: getPasswordResetEmailHtml(resetLink, user.email.split('@')[0]),
        text: getPasswordResetEmailText(resetLink),
      }, {
        action: 'PASSWORD_RESET_REQUEST',
        entityType: 'User',
        entityId: user.id,
        userId: 'system',
      })

      if (!emailResult.success) {
        console.error('[FORGOT_PASSWORD] Failed to send email', {
          userId: user.id,
          email: user.email,
          error: emailResult.error,
        })
      } else {
        console.log('[FORGOT_PASSWORD] Email sent successfully', {
          userId: user.id,
          email: user.email,
          messageId: emailResult.messageId,
        })
      }
    } catch (error) {
      console.error('[FORGOT_PASSWORD] Exception sending email', {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      // Don't fail the request if email fails - token is still saved
      // In production, you might want to handle this differently
    }

    return NextResponse.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
    })
  } catch (error) {
    console.error('Failed to process password reset request:', error)
    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    )
  }
}
