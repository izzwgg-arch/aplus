const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Checking what the deletion script actually deleted...')
  console.log('')

  // The deleted user IDs from the audit logs
  const deletedUserIds = [
    'cmk3k4kl9000nqq64cis7p2ho',
    'cmk3l6fqm0001zicw23yisqdi',
    'cmk4c6ct9000las18v9lj9h0i',
    'cmkblty02000bmgij4o7chlr8',
    'cmkblq4tb0001mgijs7w3a2ri',
    'cmk3gyrqj0000z6aeqaj3hsqb',
    'cmk4tjskc001asbiapl4k3dp4',
    'cmk6fstqz0001n8vuva2p43ic',
  ]

  console.log(`Checking timesheets for ${deletedUserIds.length} deleted users...`)
  console.log('')

  // Check all audit logs for any timesheet-related activity
  const allTimesheetLogs = await prisma.auditLog.findMany({
    where: {
      entityType: 'Timesheet',
    },
    select: {
      id: true,
      entityId: true,
      userId: true,
      action: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })

  console.log(`Total timesheet audit log entries: ${allTimesheetLogs.length}`)
  
  // Find timesheets created by deleted users
  const timesheetsFromDeletedUsers = allTimesheetLogs.filter(log => 
    deletedUserIds.includes(log.userId) && log.action === 'CREATE'
  )

  console.log(`Timesheets created by deleted users (from audit logs): ${timesheetsFromDeletedUsers.length}`)
  
  if (timesheetsFromDeletedUsers.length > 0) {
    console.log('')
    console.log('Timesheet IDs created by deleted users:')
    timesheetsFromDeletedUsers.forEach(log => {
      console.log(`  - ${log.entityId} (created ${log.createdAt}, user ${log.userId})`)
    })
  }

  // Check which of these still exist
  const timesheetIds = timesheetsFromDeletedUsers.map(log => log.entityId)
  if (timesheetIds.length > 0) {
    const existing = await prisma.timesheet.findMany({
      where: {
        id: { in: timesheetIds },
      },
      select: {
        id: true,
        deletedAt: true,
      },
    })

    const existingIds = new Set(existing.map(t => t.id))
    const missingIds = timesheetIds.filter(id => !existingIds.has(id))
    const softDeleted = existing.filter(t => t.deletedAt).map(t => t.id)

    console.log('')
    console.log(`Still exist: ${existing.length}`)
    console.log(`Soft-deleted: ${softDeleted.length}`)
    console.log(`Hard-deleted (missing): ${missingIds.length}`)
    
    if (missingIds.length > 0) {
      console.log('')
      console.log('Hard-deleted timesheet IDs:')
      missingIds.forEach(id => {
        const log = timesheetsFromDeletedUsers.find(l => l.entityId === id)
        console.log(`  - ${id} (created ${log?.createdAt || 'unknown'})`)
      })
    }
  }

  // Also check invoice entries that might reference deleted timesheets
  console.log('')
  console.log('Checking invoice entries for references to deleted timesheets...')
  
  const invoiceEntries = await prisma.invoiceEntry.findMany({
    where: {
      timesheetId: { not: null },
    } as any,
    select: {
      id: true,
      timesheetId: true,
      invoiceId: true,
    },
    take: 10000,
  })

  const timesheetIdsInInvoices = new Set(invoiceEntries.map(e => e.timesheetId).filter(Boolean))
  console.log(`Found ${timesheetIdsInInvoices.size} unique timesheet IDs referenced in invoices`)

  // Check which of these timesheets exist
  const invoiceTimesheetIds = Array.from(timesheetIdsInInvoices)
  if (invoiceTimesheetIds.length > 0) {
    const existingInvoiceTimesheets = await prisma.timesheet.findMany({
      where: {
        id: { in: invoiceTimesheetIds },
      },
      select: {
        id: true,
      },
    })

    const existingInvoiceIds = new Set(existingInvoiceTimesheets.map(t => t.id))
    const missingInvoiceTimesheets = invoiceTimesheetIds.filter(id => !existingInvoiceIds.has(id))

    console.log(`Timesheets referenced in invoices that still exist: ${existingInvoiceTimesheets.length}`)
    console.log(`Timesheets referenced in invoices that are missing: ${missingInvoiceTimesheets.length}`)

    if (missingInvoiceTimesheets.length > 0) {
      console.log('')
      console.log('Missing timesheets referenced in invoices (first 20):')
      missingInvoiceTimesheets.slice(0, 20).forEach(id => {
        console.log(`  - ${id}`)
      })
    }
  }

  await prisma.$disconnect()
}

main().catch(console.error)
