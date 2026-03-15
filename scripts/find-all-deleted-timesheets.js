const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('FINDING ALL DELETED TIMESHEETS')
  console.log('='.repeat(80))
  console.log('')

  // Check for soft-deleted timesheets (any date)
  const softDeleted = await prisma.timesheet.findMany({
    where: {
      deletedAt: { not: null },
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      deletedAt: true,
      status: true,
      startDate: true,
      endDate: true,
    },
    orderBy: { deletedAt: 'desc' },
  })

  console.log(`Found ${softDeleted.length} soft-deleted timesheet(s):`)
  softDeleted.forEach(ts => {
    console.log(`  - ${ts.id}: Created ${ts.createdAt}, Deleted ${ts.deletedAt}, Status: ${ts.status}, UserId: ${ts.userId}`)
  })
  console.log('')

  // Check for orphaned timesheet entries (entries without a timesheet - indicates hard-deleted timesheets)
  const orphanedEntries = await prisma.$queryRaw`
    SELECT 
      te.id,
      te."timesheetId",
      te.date,
      te."startTime",
      te."endTime",
      te."createdAt",
      te."updatedAt"
    FROM "TimesheetEntry" te
    LEFT JOIN "Timesheet" t ON te."timesheetId" = t.id
    WHERE t.id IS NULL
    ORDER BY te."createdAt" DESC
    LIMIT 1000
  `

  console.log(`Found ${orphanedEntries.length} orphaned timesheet entries (indicating hard-deleted timesheets):`)
  
  // Group by timesheetId
  const timesheetIds = new Set()
  orphanedEntries.forEach(entry => {
    timesheetIds.add(entry.timesheetId)
    console.log(`  - Entry ID: ${entry.id}, TimesheetId: ${entry.timesheetId}, Date: ${entry.date}, Created: ${entry.createdAt}`)
  })
  
  console.log('')
  console.log(`Unique hard-deleted timesheet IDs found: ${timesheetIds.size}`)
  console.log('')

  // Check audit logs for timesheet creation
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: 'Timesheet',
      action: 'CREATE',
    },
    select: {
      id: true,
      entityId: true,
      userId: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  console.log(`Found ${auditLogs.length} audit log entries for timesheet creation`)
  console.log('Checking which timesheets still exist...')
  console.log('')

  let existingCount = 0
  let missingCount = 0
  const missingTimesheets = []

  for (const log of auditLogs) {
    const timesheet = await prisma.timesheet.findUnique({
      where: { id: log.entityId },
      select: { id: true, deletedAt: true },
    })

    if (!timesheet) {
      missingCount++
      missingTimesheets.push({
        id: log.entityId,
        createdAt: log.createdAt,
        userId: log.userId,
      })
      console.log(`  ❌ Missing: ${log.entityId} (created ${log.createdAt}, user ${log.userId})`)
    } else if (timesheet.deletedAt) {
      console.log(`  ⚠️  Soft-deleted: ${log.entityId} (deleted ${timesheet.deletedAt})`)
    } else {
      existingCount++
    }
  }

  console.log('')
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Soft-deleted timesheets: ${softDeleted.length}`)
  console.log(`Orphaned entries (hard-deleted timesheets): ${timesheetIds.size}`)
  console.log(`Total entries in orphaned timesheets: ${orphanedEntries.length}`)
  console.log(`Audit logs checked: ${auditLogs.length}`)
  console.log(`  - Existing: ${existingCount}`)
  console.log(`  - Missing (hard-deleted): ${missingCount}`)
  console.log('')

  if (missingTimesheets.length > 0) {
    console.log('Hard-deleted timesheet IDs (from audit logs):')
    missingTimesheets.forEach(ts => {
      console.log(`  - ${ts.id} (created ${ts.createdAt})`)
    })
  }

  await prisma.$disconnect()
}

main().catch(console.error)
