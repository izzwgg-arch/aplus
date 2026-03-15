const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('FINDING TIMESHEETS FROM DELETED USERS')
  console.log('='.repeat(80))
  console.log('')

  // The deleted user emails
  const deletedUserEmails = [
    'Esti@apluscenterinc.org',
    'esti@apluscenterinc.org',
    'leahw@apluscenterinc.org',
    'Leahw@apluscenterinc.org',
    'Libbyw@apluscenterinc.org',
    'libbyw@apluscenterinc.org',
  ]

  console.log('Checking for timesheets from deleted users...')
  console.log('')

  // First, find the user IDs that were deleted (check audit logs or find any remaining references)
  // Check audit logs for user deletions
  const userDeletionLogs = await prisma.auditLog.findMany({
    where: {
      entityType: 'User',
      action: 'DELETE',
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

  console.log(`Found ${userDeletionLogs.length} user deletion audit log entries`)
  const deletedUserIds = new Set()
  userDeletionLogs.forEach(log => {
    deletedUserIds.add(log.entityId)
    console.log(`  - User ID: ${log.entityId}, Deleted at: ${log.createdAt}`)
  })
  console.log('')

  // Check all audit logs for timesheet creation by these users
  console.log('Checking audit logs for timesheets created by deleted users...')
  const timesheetLogs = await prisma.auditLog.findMany({
    where: {
      entityType: 'Timesheet',
      userId: { in: Array.from(deletedUserIds) },
    },
    select: {
      id: true,
      entityId: true,
      userId: true,
      action: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  console.log(`Found ${timesheetLogs.length} audit log entries for timesheets from deleted users`)
  console.log('')

  // Group by timesheet ID
  const timesheetIds = new Set()
  timesheetLogs.forEach(log => {
    if (log.entityType === 'Timesheet') {
      timesheetIds.add(log.entityId)
    }
  })

  console.log(`Unique timesheet IDs found in audit logs: ${timesheetIds.size}`)
  console.log('')

  // Check which of these timesheets still exist
  const existingTimesheets = await prisma.timesheet.findMany({
    where: {
      id: { in: Array.from(timesheetIds) },
    },
    select: {
      id: true,
      userId: true,
      deletedAt: true,
      createdAt: true,
      status: true,
    },
  })

  const existingIds = new Set(existingTimesheets.map(t => t.id))
  const missingIds = Array.from(timesheetIds).filter(id => !existingIds.has(id))
  const softDeletedIds = existingTimesheets.filter(t => t.deletedAt).map(t => t.id)

  console.log(`Timesheets that still exist: ${existingTimesheets.length}`)
  console.log(`Timesheets that are soft-deleted: ${softDeletedIds.length}`)
  console.log(`Timesheets that are hard-deleted (missing): ${missingIds.length}`)
  console.log('')

  if (missingIds.length > 0) {
    console.log('Hard-deleted timesheet IDs (from deleted users):')
    missingIds.forEach(id => {
      const log = timesheetLogs.find(l => l.entityId === id)
      console.log(`  - ${id} (created ${log?.createdAt || 'unknown'}, user ${log?.userId || 'unknown'})`)
    })
    console.log('')
  }

  // Also check for any timesheets with userId matching deleted users
  // This won't work if users are hard-deleted, but let's try to find orphaned references
  console.log('Checking for timesheets with orphaned user references...')
  
  // Get all timesheet user IDs and check if users exist
  const allTimesheets = await prisma.timesheet.findMany({
    where: {
      deletedAt: null, // Only active timesheets
    },
    select: {
      id: true,
      userId: true,
    },
    take: 10000,
  })

  const orphanedTimesheets = []
  for (const ts of allTimesheets) {
    const user = await prisma.user.findUnique({
      where: { id: ts.userId },
      select: { id: true, deletedAt: true },
    })
    
    if (!user || user.deletedAt) {
      orphanedTimesheets.push(ts)
    }
  }

  console.log(`Found ${orphanedTimesheets.length} timesheets with deleted users:`)
  orphanedTimesheets.forEach(ts => {
    console.log(`  - ${ts.id} (userId: ${ts.userId})`)
  })

  console.log('')
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Deleted user IDs found: ${deletedUserIds.size}`)
  console.log(`Timesheet audit log entries: ${timesheetLogs.length}`)
  console.log(`Unique timesheet IDs in logs: ${timesheetIds.size}`)
  console.log(`  - Still exist: ${existingTimesheets.length}`)
  console.log(`  - Soft-deleted: ${softDeletedIds.length}`)
  console.log(`  - Hard-deleted: ${missingIds.length}`)
  console.log(`Orphaned timesheets (active but user deleted): ${orphanedTimesheets.length}`)
  console.log('')

  await prisma.$disconnect()
}

main().catch(console.error)
