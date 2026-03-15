import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/activity
 * Fetch recent activities for admin dashboard
 * Only accessible by ADMIN or SUPER_ADMIN
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20')

    // Fetch activities ordered by newest first
    const activities = await prisma.activity.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    })

    // Format activities for response
    const formattedActivities = activities.map((activity) => ({
      id: activity.id,
      actionType: activity.actionType,
      actorUserId: activity.actorUserId,
      actorEmail: activity.actorEmail,
      actorRole: activity.actorRole,
      ipAddress: activity.ipAddress,
      userAgent: activity.userAgent,
      metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
      createdAt: activity.createdAt instanceof Date ? activity.createdAt.toISOString() : activity.createdAt,
    }))

    return NextResponse.json({ activities: formattedActivities })
  } catch (error) {
    console.error('Error fetching activities:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    )
  }
}
