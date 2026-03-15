import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/admin/activity/mark-seen
 * Mark activities as seen by updating admin's lastSeenActivityAt timestamp
 * Only accessible by ADMIN or SUPER_ADMIN
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const isAdmin = session && (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN')
    if (!session || !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Update admin's lastSeenActivityAt to now
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSeenActivityAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking activities as seen:', error)
    return NextResponse.json(
      { error: 'Failed to mark activities as seen' },
      { status: 500 }
    )
  }
}
