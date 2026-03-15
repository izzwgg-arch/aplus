import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

/**
 * DELETE EMAIL QUEUE ITEM
 * 
 * Soft deletes an email queue item
 * Permission: emailQueue.delete
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const itemId = resolvedParams.id

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

    // Verify item exists and is not already deleted
    const item = await prisma.emailQueueItem.findUnique({
      where: { id: itemId },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.deletedAt) {
      return NextResponse.json({ error: 'Item already deleted' }, { status: 400 })
    }

    // Soft delete
    await prisma.emailQueueItem.update({
      where: { id: itemId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: session.user.id,
      },
    })

    return NextResponse.json({ success: true, message: 'Item removed from queue' })
  } catch (error: any) {
    console.error('[EMAIL QUEUE DELETE] Error:', {
      error: error?.message,
      stack: error?.stack,
    })
    return NextResponse.json(
      { error: 'Failed to delete item', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
