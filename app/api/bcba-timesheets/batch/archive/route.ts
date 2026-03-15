import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'

/**
 * POST /api/bcba-timesheets/batch/archive
 * Batch archive/unarchive BCBA timesheets
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const permissions = await getUserPermissions(session.user.id)
    const canManageTimesheets = 
      permissions['bcbaTimesheets.update']?.canUpdate === true ||
      permissions['timesheets.update']?.canUpdate === true ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'SUPER_ADMIN'

    if (!canManageTimesheets) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    const data = await request.json()
    const { ids, archived } = data

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'No timesheets selected' },
        { status: 400 }
      )
    }

    if (typeof archived !== 'boolean') {
      return NextResponse.json(
        { error: 'archived must be a boolean' },
        { status: 400 }
      )
    }

    // Check if archived column exists, create it if not
    try {
      await prisma.$queryRaw`SELECT "archived" FROM "Timesheet" LIMIT 1`
    } catch (error: any) {
      if (error.message?.includes('column "archived" does not exist')) {
        // Column doesn't exist, create it (must execute each statement separately)
        await prisma.$executeRawUnsafe(`ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false`)
        try {
          await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Timesheet_archived_deletedAt_idx" ON "Timesheet"("archived", "deletedAt")`)
        } catch (idxError: any) {
          // Index might already exist, ignore
        }
        try {
          await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Timesheet_isBCBA_archived_deletedAt_idx" ON "Timesheet"("isBCBA", "archived", "deletedAt")`)
        } catch (idxError: any) {
          // Index might already exist, ignore
        }
      } else {
        throw error
      }
    }

    // Update timesheets (only non-deleted, BCBA timesheets)
    // Use raw SQL since Prisma client may not have archived field yet
    // Format array properly for PostgreSQL - escape IDs to prevent SQL injection
    const escapedIds = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')
    const idsArray = `{${escapedIds}}`
    const result = await prisma.$executeRawUnsafe(`
      UPDATE "Timesheet"
      SET "archived" = ${archived ? 'true' : 'false'}
      WHERE id = ANY(${idsArray}::text[])
        AND "deletedAt" IS NULL
        AND "isBCBA" = true
    `)
    
    const count = Array.isArray(result) ? result.length : (typeof result === 'number' ? result : ids.length)

    return NextResponse.json({
      success: true,
      message: `Successfully ${archived ? 'archived' : 'unarchived'} ${count} BCBA timesheet(s)`,
      count: count,
    })
  } catch (error: any) {
    console.error('[BCBA BATCH ARCHIVE] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update BCBA timesheets', details: error.message },
      { status: 500 }
    )
  }
}
