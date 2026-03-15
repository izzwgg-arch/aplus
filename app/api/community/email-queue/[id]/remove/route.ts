import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessCommunitySection, getUserPermissions } from '@/lib/permissions'

/**
 * DELETE COMMUNITY EMAIL QUEUE ITEM
 * 
 * Soft deletes a community email queue item
 * Permission: community.invoices.emailqueue.delete
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

    // Check Community Classes subsection permission
    const hasAccess = await canAccessCommunitySection(session.user.id, 'emailQueue')
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden - No access to Community Classes Email Queue' },
        { status: 403 }
      )
    }

    // Check delete permission
    const userPermissions = await getUserPermissions(session.user.id)
    const canDelete =
      userPermissions['community.invoices.emailqueue.delete']?.canDelete === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canDelete) {
      return NextResponse.json(
        { error: 'Forbidden - Not authorized to delete email queue items' },
        { status: 403 }
      )
    }

    // Find the queue item
    const queueItem = await prisma.emailQueueItem.findUnique({
      where: { id: itemId },
    })

    if (!queueItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (queueItem.deletedAt) {
      return NextResponse.json({ error: 'Item already deleted' }, { status: 400 })
    }

    // Ensure it's a community invoice queue item
    if (queueItem.entityType !== 'COMMUNITY_INVOICE') {
      return NextResponse.json({ error: 'Invalid queue item type' }, { status: 400 })
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
    console.error('[COMMUNITY EMAIL QUEUE DELETE] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete item',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
