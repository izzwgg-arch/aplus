import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { validatePassword } from '@/lib/utils'
import { logCreate } from '@/lib/audit'
import { generateTemporaryPassword } from '@/lib/security'
import { sendMailSafe, getNewUserInviteEmailHtml, getNewUserInviteEmailText } from '@/lib/email'
import { generateSecureToken } from '@/lib/security'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role') || ''
    const active = searchParams.get('active')

    const where: any = { deletedAt: null }

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (role) {
      where.role = role
    }

    if (active !== null && active !== undefined && active !== '') {
      where.active = active === 'true'
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          customRoleId: true,
          customRole: {
            select: {
              id: true,
              name: true,
            }
          },
          active: true,
          activationStart: true,
          activationEnd: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      console.error('[CREATE USER] Unauthorized access attempt', {
        userId: session?.user?.id,
        role: session?.user?.role,
      })
      return NextResponse.json(
        { 
          error: 'UNAUTHORIZED',
          message: 'You do not have permission to create users',
        },
        { status: 401 }
      )
    }

    const data = await request.json()
    console.log('[CREATE USER] Request received', {
      username: data.username,
      email: data.email,
      role: data.role,
      hasCustomRoleId: !!data.customRoleId,
      active: data.active,
    })

    const {
      username,
      email,
      password, // Ignored for new users - always generate temp password
      role,
      active,
      activationStart,
      activationEnd,
    } = data

    // Validation
    if (!username || !username.trim()) {
      return NextResponse.json(
        { 
          error: 'VALIDATION_ERROR',
          message: 'Username is required',
        },
        { status: 400 }
      )
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { 
          error: 'VALIDATION_ERROR',
          message: 'Email is required',
        },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { 
          error: 'VALIDATION_ERROR',
          message: 'Invalid email format',
        },
        { status: 400 }
      )
    }

    // If a custom role is provided, allow it for USER/CUSTOM (but not ADMIN/SUPER_ADMIN)
    if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && data.customRoleId) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Admins cannot be assigned a custom role',
        },
        { status: 400 }
      )
    }

    // Always use temp password for new users (password field is not used in UI)
    // Admin does not enter password - system generates temp password
    const tempPassword = generateTemporaryPassword()
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10)
    
    // Set temp password expiration (72 hours from now)
    const tempPasswordExpiresAt = new Date()
    const ttlHours = parseInt(process.env.TEMP_PASSWORD_TTL_HOURS || '72')
    tempPasswordExpiresAt.setHours(tempPasswordExpiresAt.getHours() + ttlHours)
    
    // Create a placeholder password hash (user must set password on first login)
    // This prevents login until password is set
    const placeholderPassword = await bcrypt.hash(generateSecureToken(32), 10)

    // Normalize email to lowercase for consistency
    const normalizedEmail = email.trim().toLowerCase()
    
    // Check if user already exists by username or email (case-insensitive for email)
    const existingUserByUsername = await prisma.user.findUnique({
      where: { username: username.trim() },
    })

    if (existingUserByUsername && !existingUserByUsername.deletedAt) {
      console.error('[CREATE USER] Username already exists', { username: username.trim() })
      return NextResponse.json(
        { 
          error: 'DUPLICATE_USERNAME',
          message: 'That username is already in use',
        },
        { status: 409 }
      )
    }

    // Check for existing email case-insensitively (including soft-deleted)
    // Use raw query for case-insensitive check since Prisma unique constraints are case-sensitive
    const existingUsersByEmail = await prisma.$queryRaw<Array<{ id: string; email: string; deletedAt: Date | null }>>`
      SELECT id, email, "deletedAt"
      FROM "User"
      WHERE LOWER(email) = LOWER(${normalizedEmail})
      LIMIT 1
    `
    const existingUserByEmail = existingUsersByEmail[0] || null

    if (existingUserByEmail && !existingUserByEmail.deletedAt) {
      console.error('[CREATE USER] Email already exists', { email: normalizedEmail, foundEmail: existingUserByEmail.email })
      return NextResponse.json(
        { 
          error: 'DUPLICATE_EMAIL',
          message: 'That email is already in use',
        },
        { status: 409 }
      )
    }

    // Create user with temp password
    let user
    try {
      user = await prisma.user.create({
        data: {
          username: username.trim(),
          email: normalizedEmail, // Use normalized lowercase email
          password: placeholderPassword, // Placeholder - cannot login with this
          tempPasswordHash: tempPasswordHash, // Actual temp password for first login
          tempPasswordExpiresAt: tempPasswordExpiresAt,
          role: role || 'USER',
          // Allow USERs to be assigned a custom role as well (role permissions drive access)
          customRoleId: (role === 'ADMIN' || role === 'SUPER_ADMIN') ? null : (data.customRoleId || null),
          active: active !== undefined ? active : true,
          activationStart: activationStart ? new Date(activationStart) : null,
          activationEnd: activationEnd ? new Date(activationEnd) : null,
          mustChangePassword: true, // Always force password change on first login
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          customRoleId: true,
          customRole: {
            select: {
              id: true,
              name: true,
            }
          },
          active: true,
          activationStart: true,
          activationEnd: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      console.log('[CREATE USER] User created successfully', { userId: user.id, email: user.email })
    } catch (prismaError: any) {
      // Handle Prisma unique constraint violations
      if (prismaError?.code === 'P2002') {
        const target = prismaError?.meta?.target
        console.error('[CREATE USER] Unique constraint violation', {
          code: prismaError.code,
          target,
          username: username.trim(),
          email: email.trim(),
        })
        
        if (Array.isArray(target)) {
          if (target.includes('username')) {
            return NextResponse.json(
              { 
                error: 'DUPLICATE_USERNAME',
                message: 'That username is already in use',
              },
              { status: 409 }
            )
          }
          if (target.includes('email')) {
            return NextResponse.json(
              { 
                error: 'DUPLICATE_EMAIL',
                message: 'That email is already in use',
              },
              { status: 409 }
            )
          }
        }
        
        return NextResponse.json(
          { 
            error: 'DUPLICATE_ENTRY',
            message: 'A user with this information already exists',
          },
          { status: 409 }
        )
      }
      
      // Handle other Prisma errors
      if (prismaError?.code?.startsWith('P')) {
        console.error('[CREATE USER] Prisma error', {
          code: prismaError.code,
          message: prismaError.message,
          meta: prismaError.meta,
        })
        return NextResponse.json(
          { 
            error: 'DATABASE_ERROR',
            message: 'Database error occurred. Please check logs.',
            code: prismaError.code,
          },
          { status: 500 }
        )
      }
      
      // Re-throw if not a Prisma error
      throw prismaError
    }

    // Log audit (do NOT log temp password)
    await logCreate('User', user.id, session.user.id, {
      email: user.email,
      role: user.role,
      active: user.active,
      mustChangePassword: true,
      tempPasswordGenerated: true, // Only log that temp password was generated, not the password itself
    })

    // Send invite email with temp password
    let emailSent = false
    try {
      const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://66.94.105.43:3000'
      const loginUrl = `${baseUrl}/login`
      
      const emailResult = await sendMailSafe({
        to: user.email,
        subject: 'You\'ve been invited to Smart Steps ABA',
        html: getNewUserInviteEmailHtml(user.email, tempPassword, loginUrl, user.username),
        text: getNewUserInviteEmailText(user.email, tempPassword, loginUrl),
      }, {
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        userId: session.user.id,
      })

      if (emailResult.success) {
        emailSent = true
        // Log email sent (do NOT log temp password)
        await logCreate('User', user.id, session.user.id, {
          action: 'invite_email_sent',
          email: user.email,
        })
      } else {
        console.error('[CREATE USER] Failed to send invite email:', emailResult.error)
        // Log email failure
        await logCreate('User', user.id, session.user.id, {
          action: 'invite_email_failed',
          email: user.email,
          error: emailResult.error,
        })
      }
    } catch (error: any) {
      console.error('[CREATE USER] Exception sending invite email:', {
        userId: user.id,
        email: user.email,
        error: error.message,
        stack: error.stack,
      })
      // Log email failure
      await logCreate('User', user.id, session.user.id, {
        action: 'invite_email_failed',
        email: user.email,
        error: error.message || 'Unknown error',
      })
    }

    // Don't return temp password in response
    const userResponse = { ...user }
    delete (userResponse as any).password

    return NextResponse.json({ ...userResponse, emailSent }, { status: 201 })
  } catch (error: any) {
    // Log full error details
    console.error('[CREATE USER] Unexpected error', {
      error: error?.message,
      stack: error?.stack,
      code: error?.code,
      name: error?.name,
      meta: error?.meta,
    })
    
    // Return structured error response
    return NextResponse.json(
      { 
        error: 'SERVER_ERROR',
        message: 'An unexpected error occurred while creating the user',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
      { status: 500 }
    )
  }
}
