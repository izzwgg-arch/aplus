const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Checking for deleted timesheets...')
  console.log('')

  // Get yesterday's date (assuming it was 2026-01-12 based on context)
  // Adjust this date to match the actual date when timesheets were created
  const yesterday = new Date('2026-01-12')
  yesterday.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date('2026-01-12')
  yesterdayEnd.setHours(23, 59, 59, 999)

  console.log(`Checking for timesheets created between: ${yesterday.toISOString()} and ${yesterdayEnd.toISOString()}`)
  console.log('')

  // Check if there are any timesheets with deletedAt set (soft-deleted)
  const softDeleted = await prisma.timesheet.findMany({
    where: {
      deletedAt: { not: null },
      createdAt: {
        gte: yesterday,
        lte: yesterdayEnd,
      },
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
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Found ${softDeleted.length} soft-deleted timesheet(s) from yesterday:`)
  softDeleted.forEach(ts => {
    console.log(`  - ID: ${ts.id}, UserId: ${ts.userId}, Created: ${ts.createdAt}, Deleted: ${ts.deletedAt}, Status: ${ts.status}`)
  })
  console.log('')

  // Check all timesheets created yesterday (including non-deleted)
  const allFromYesterday = await prisma.timesheet.findMany({
    where: {
      createdAt: {
        gte: yesterday,
        lte: yesterdayEnd,
      },
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
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Total timesheets created yesterday: ${allFromYesterday.length}`)
  console.log(`  - Active: ${allFromYesterday.filter(t => !t.deletedAt).length}`)
  console.log(`  - Soft-deleted: ${allFromYesterday.filter(t => t.deletedAt).length}`)
  console.log('')

  // Check for timesheets that might have been hard-deleted
  // We can't directly query hard-deleted records, but we can check:
  // 1. TimesheetEntries that might be orphaned
  // 2. InvoiceEntries that reference non-existent timesheets
  // 3. Audit logs that mention timesheets

  // Check for orphaned timesheet entries (entries without a timesheet)
  const orphanedEntries = await prisma.$queryRaw`
    SELECT te.id, te."timesheetId", te.date, te."startTime", te."endTime"
    FROM "TimesheetEntry" te
    LEFT JOIN "Timesheet" t ON te."timesheetId" = t.id
    WHERE t.id IS NULL
    AND te."createdAt" >= ${yesterday}
    AND te."createdAt" <= ${yesterdayEnd}
    LIMIT 100
  `

  console.log(`Found ${orphanedEntries.length} orphaned timesheet entries (indicating hard-deleted timesheets):`)
  orphanedEntries.forEach(entry => {
    console.log(`  - Entry ID: ${entry.id}, TimesheetId: ${entry.timesheetId}, Date: ${entry.date}`)
  })
  console.log('')

  // Check audit logs for timesheet creation on that date
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: 'Timesheet',
      action: 'CREATE',
      createdAt: {
        gte: yesterday,
        lte: yesterdayEnd,
      },
    },
    select: {
      id: true,
      entityId: true,
      userId: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  console.log(`Found ${auditLogs.length} audit log entries for timesheet creation yesterday:`)
  auditLogs.forEach(log => {
    console.log(`  - TimesheetId: ${log.entityId}, UserId: ${log.userId}, Created: ${log.createdAt}`)
    
    // Check if this timesheet still exists
    prisma.timesheet.findUnique({
      where: { id: log.entityId },
    }).then(ts => {
      if (!ts) {
        console.log(`    ⚠️  Timesheet ${log.entityId} was HARD DELETED (not found in database)`)
      }
    })
  })

  await prisma.$disconnect()
}

main().catch(console.error)
