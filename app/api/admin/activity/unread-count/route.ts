import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/activity/unread-count
 * Get count of unread activities for the current admin
 * Only accessible by ADMIN or SUPER_ADMIN
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const isAdmin = session && (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN')
    if (!session || !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get admin's last seen activity timestamp
    const admin = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastSeenActivityAt: true },
    })

    const lastSeenAt = admin?.lastSeenActivityAt

    // Count activities created after last seen timestamp
    // If lastSeenAt is null, count all activities
    const whereClause = lastSeenAt
      ? {
          createdAt: {
            gt: lastSeenAt,
          },
        }
      : {}

    const unreadCount = await prisma.activity.count({
      where: whereClause,
    })

    return NextResponse.json({ unreadCount })
  } catch (error) {
    console.error('Error fetching unread activity count:', error)
    return NextResponse.json(
      { error: 'Failed to fetch unread count' },
      { status: 500 }
    )
  }
}
