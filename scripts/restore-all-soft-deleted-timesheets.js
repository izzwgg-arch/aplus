const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('RESTORE ALL SOFT-DELETED TIMESHEETS')
  console.log('='.repeat(80))
  console.log('')

  // Find all soft-deleted timesheets
  const deletedTimesheets = await prisma.timesheet.findMany({
    where: {
      deletedAt: { not: null },
    },
    include: {
      entries: true,
      user: {
        select: { id: true, email: true, username: true, deletedAt: true },
      },
    },
    orderBy: { deletedAt: 'desc' },
  })

  console.log(`Found ${deletedTimesheets.length} soft-deleted timesheet(s) to restore:`)
  deletedTimesheets.forEach(ts => {
    console.log(`  - ${ts.id}: Created ${ts.createdAt}, Deleted ${ts.deletedAt}, Status: ${ts.status}, Entries: ${ts.entries.length}, User: ${ts.user?.email || ts.userId} ${ts.user?.deletedAt ? '(DELETED)' : ''}`)
  })
  console.log('')

  if (deletedTimesheets.length === 0) {
    console.log('No timesheets to restore.')
    await prisma.$disconnect()
    return
  }

  // Find an admin user for reassignment if needed
  const adminUser = await prisma.user.findFirst({
    where: {
      role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      deletedAt: null,
      active: true,
    },
    select: { id: true, email: true, username: true },
  })

  if (!adminUser) {
    console.error('❌ ERROR: No active admin user found!')
    await prisma.$disconnect()
    return
  }

  console.log(`Admin user for reassignment: ${adminUser.email} (${adminUser.id})`)
  console.log('')

  // Restore timesheets
  let restoredCount = 0
  let reassignedCount = 0
  const restoredIds = []
  const failedIds = []

  for (const ts of deletedTimesheets) {
    try {
      const updateData = {
        deletedAt: null,
      }

      // If user is deleted, reassign to admin
      if (!ts.user || ts.user.deletedAt) {
        updateData.userId = adminUser.id
        reassignedCount++
        console.log(`  ↻ Reassigning timesheet ${ts.id} to admin user ${adminUser.id}`)
      }

      await prisma.timesheet.update({
        where: { id: ts.id },
        data: updateData,
      })

      restoredCount++
      restoredIds.push(ts.id)
      console.log(`  ✓ Restored timesheet ${ts.id} (${ts.entries.length} entries, status: ${ts.status})`)
    } catch (error) {
      console.error(`  ❌ Failed to restore timesheet ${ts.id}:`, error.message)
      failedIds.push({ id: ts.id, error: error.message })
    }
  }

  console.log('')
  console.log('='.repeat(80))
  console.log('RESTORATION SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total timesheets found: ${deletedTimesheets.length}`)
  console.log(`Successfully restored: ${restoredCount}`)
  console.log(`Reassigned to admin: ${reassignedCount}`)
  console.log(`Failed: ${failedIds.length}`)
  console.log('')

  if (restoredIds.length > 0) {
    console.log('Restored timesheet IDs:')
    restoredIds.forEach(id => console.log(`  - ${id}`))
    console.log('')
  }

  if (failedIds.length > 0) {
    console.log('Failed timesheet IDs:')
    failedIds.forEach(({ id, error }) => console.log(`  - ${id}: ${error}`))
    console.log('')
  }

  // Verify restoration
  const verifyCount = await prisma.timesheet.count({
    where: {
      id: { in: restoredIds },
      deletedAt: null,
    },
  })

  console.log(`Verification: ${verifyCount} of ${restoredIds.length} timesheets are now active`)
  
  if (verifyCount === restoredIds.length && restoredIds.length > 0) {
    console.log('✓ All timesheets successfully restored!')
  } else if (restoredIds.length === 0) {
    console.log('⚠️  No timesheets were restored')
  } else {
    console.log(`⚠️  Warning: Only ${verifyCount} timesheets verified as restored`)
  }

  console.log('')
  console.log('='.repeat(80))
  console.log('IMPORTANT NOTE')
  console.log('='.repeat(80))
  console.log('Hard-deleted timesheets (permanently removed) cannot be recovered')
  console.log('without a database backup. The deletion script used deleteMany()')
  console.log('which permanently removes records from the database.')
  console.log('')
  console.log('If you have a database backup from before the user deletion,')
  console.log('we can restore those timesheets from the backup.')
  console.log('')

  await prisma.$disconnect()
}

main().catch(console.error)
