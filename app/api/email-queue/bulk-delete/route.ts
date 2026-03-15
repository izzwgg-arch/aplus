import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

/**
 * BULK DELETE EMAIL QUEUE ITEMS
 * 
 * Soft deletes multiple email queue items
 * Permission: emailQueue.delete
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const userPermissions = await getUserPermissions(session.user.id)
    const canDelete =
      userPermissions['emailQueue.delete']?.canDelete === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canDelete) {
      return NextResponse.json(
        { error: 'Forbidden - Not authorized to delete email queue items' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { ids } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Invalid request: ids array required' }, { status: 400 })
    }

    // Verify items exist and are not already deleted
    const items = await prisma.emailQueueItem.findMany({
      where: {
        id: { in: ids },
        deletedAt: null, // Only delete non-deleted items
      },
    })

    if (items.length === 0) {
      return NextResponse.json({ error: 'No valid items found to delete' }, { status: 404 })
    }

    // Soft delete all items
    const result = await prisma.emailQueueItem.updateMany({
      where: {
        id: { in: items.map((item) => item.id) },
      },
      data: {
        deletedAt: new Date(),
        deletedByUserId: session.user.id,
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `${result.count} item(s) removed from queue`,
    })
  } catch (error: any) {
    console.error('[EMAIL QUEUE BULK DELETE] Error:', {
      error: error?.message,
      stack: error?.stack,
    })
    return NextResponse.json(
      { error: 'Failed to delete items', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
