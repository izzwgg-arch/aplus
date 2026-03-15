import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { isWithinScheduledWindow } from './utils'
import { createAuditLog } from './audit'

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        })

        if (!user || user.deletedAt) {
          throw new Error('Invalid credentials')
        }

        if (!user.active) {
          throw new Error('Account is inactive')
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
          throw new Error(`Account is locked. Please try again in ${minutesLeft} minute(s).`)
        }

        // Check scheduled activation window
        if (!isWithinScheduledWindow(user.activationStart, user.activationEnd)) {
          throw new Error('Account access is outside scheduled window')
        }

        // Check temp password expiration
        if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
          throw new Error('Temporary password has expired. Please use "Forgot Password" to reset.')
        }

        // Check password: try temp password first, then regular password
        let isValid = false
        let usingTempPassword = false

        // Try temp password first if it exists
        if (user.tempPasswordHash) {
          isValid = await bcrypt.compare(credentials.password, user.tempPasswordHash)
          if (isValid) {
            usingTempPassword = true
          }
        }

        // If temp password didn't match or doesn't exist, try regular password
        if (!isValid) {
          isValid = await bcrypt.compare(credentials.password, user.password)
        }

        if (!isValid) {
          // Increment failed login attempts
          const failedAttempts = (user.failedLoginAttempts || 0) + 1
          const maxAttempts = 5
          const lockDuration = 30 * 60 * 1000 // 30 minutes

          let updateData: any = {
            failedLoginAttempts: failedAttempts,
          }

          // Lock account after max attempts
          if (failedAttempts >= maxAttempts) {
            updateData.lockedUntil = new Date(Date.now() + lockDuration)
            await createAuditLog({
              action: 'UPDATE',
              entityType: 'User',
              entityId: user.id,
              userId: 'system',
              newValues: {
                action: 'account_locked',
                reason: 'too_many_failed_login_attempts',
                email: user.email,
              },
            })
          }

          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          })

          // Log failed login attempt (optional - can be noisy)
          // Skipped to reduce log noise

          throw new Error('Invalid credentials')
        }

        // Update user on successful login
        const updateData: any = {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(), // Update last login timestamp
        }

        // If using temp password, ensure mustChangePassword is set
        if (usingTempPassword) {
          updateData.mustChangePassword = true
        }

        await prisma.user.update({
          where: { id: user.id },
          data: updateData,
        })

        // Log successful login
        await createAuditLog({
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          userId: user.id,
          metadata: {
            email: user.email,
            usingTempPassword,
            timestamp: new Date().toISOString(),
          },
        })

        return {
          id: user.id,
          email: user.email,
          role: user.role as any, // NextAuth type compatibility
          mustChangePassword: usingTempPassword || user.mustChangePassword || false,
        } as any
      }
    })
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      // Initial login: set token from user object
      // After password update, user must sign out and log in again to get fresh token
      if (user) {
        token.role = user.role
        token.id = user.id
        token.mustChangePassword = (user as any).mustChangePassword || false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as any
        session.user.id = token.id as string
        ;(session.user as any).mustChangePassword = token.mustChangePassword as boolean
      }
      return session
    },
  },
}
