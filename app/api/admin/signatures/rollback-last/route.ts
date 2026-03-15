import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const requestId = () => `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export async function POST(request: NextRequest) {
  const reqId = requestId()
  console.log(`[SIGNATURE_ROLLBACK] ${reqId} Starting rollback`)
  
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      console.log(`[SIGNATURE_ROLLBACK] ${reqId} Unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      console.log(`[SIGNATURE_ROLLBACK] ${reqId} Forbidden - not admin`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Find most recent batch
    const lastBatch = await prisma.signatureImportBatch.findFirst({
      where: {
        type: 'SIGNATURE_IMPORT',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        items: true,
      },
    })

    if (!lastBatch) {
      return NextResponse.json(
        { error: 'No import batches found' },
        { status: 404 }
      )
    }

    console.log(`[SIGNATURE_ROLLBACK] ${reqId} Rolling back batch ${lastBatch.id} with ${lastBatch.items.length} items`)

    let restoredCount = 0
    const errors: string[] = []

    // Restore each item
    for (const item of lastBatch.items) {
      try {
        if (item.entityType === 'PROVIDER') {
          await prisma.provider.update({
            where: { id: item.entityId },
            data: { signature: item.originalSignatureUrl },
          })
        } else if (item.entityType === 'CLIENT') {
          await prisma.client.update({
            where: { id: item.entityId },
            data: { signature: item.originalSignatureUrl },
          })
        }

        // Update batch item status
        await prisma.signatureImportBatchItem.update({
          where: { id: item.id },
          data: { status: 'ROLLED_BACK' },
        })

        restoredCount++
      } catch (error: any) {
        console.error(`[SIGNATURE_ROLLBACK] ${reqId} Error restoring item ${item.id}:`, error)
        errors.push(`Failed to restore ${item.entityType} ${item.entityId}: ${error.message}`)
      }
    }

    console.log(`[SIGNATURE_ROLLBACK] ${reqId} Completed: ${restoredCount} restored, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      restoredCount,
      errors: errors.slice(0, 10),
    })
  } catch (error: any) {
    console.error(`[SIGNATURE_ROLLBACK] ${reqId} Error:`, error)
    return NextResponse.json(
      { error: error.message || 'Failed to rollback' },
      { status: 500 }
    )
  }
}
