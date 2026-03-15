const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('RESTORE DELETED TIMESHEETS')
  console.log('='.repeat(80))
  console.log('')

  // Get yesterday's date (January 11, 2026)
  const yesterday = new Date('2026-01-11')
  yesterday.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date('2026-01-11')
  yesterdayEnd.setHours(23, 59, 59, 999)

  console.log(`Restoring timesheets created between: ${yesterday.toISOString()} and ${yesterdayEnd.toISOString()}`)
  console.log('')

  // Find all soft-deleted timesheets from yesterday
  const deletedTimesheets = await prisma.timesheet.findMany({
    where: {
      deletedAt: { not: null },
      createdAt: {
        gte: yesterday,
        lte: yesterdayEnd,
      },
    },
    include: {
      entries: true,
      user: {
        select: { id: true, email: true, username: true, deletedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Found ${deletedTimesheets.length} soft-deleted timesheet(s) to restore:`)
  console.log('')

  if (deletedTimesheets.length === 0) {
    console.log('No timesheets to restore.')
    await prisma.$disconnect()
    return
  }

  // Check for timesheets with deleted users
  const deletedUserIds = []
  const validTimesheets = []
  
  for (const ts of deletedTimesheets) {
    if (!ts.user || ts.user.deletedAt) {
      deletedUserIds.push(ts.userId)
      console.log(`⚠️  Timesheet ${ts.id} has deleted user: ${ts.userId}`)
    } else {
      validTimesheets.push(ts)
    }
  }

  if (deletedUserIds.length > 0) {
    console.log('')
    console.log(`Found ${deletedUserIds.length} timesheet(s) with deleted users.`)
    console.log('Finding a valid admin user to reassign them to...')
    
    // Find an admin user to reassign to
    const adminUser = await prisma.user.findFirst({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        deletedAt: null,
        active: true,
      },
      select: { id: true, email: true, username: true },
    })

    if (!adminUser) {
      console.error('❌ ERROR: No active admin user found to reassign timesheets to!')
      console.error('Cannot restore timesheets with deleted users.')
      await prisma.$disconnect()
      return
    }

    console.log(`✓ Found admin user: ${adminUser.email} (${adminUser.id})`)
    console.log('')
  }

  // Restore timesheets
  let restoredCount = 0
  let reassignedCount = 0
  const restoredIds = []

  for (const ts of deletedTimesheets) {
    try {
      const updateData = {
        deletedAt: null,
      }

      // If user is deleted, reassign to admin
      if (!ts.user || ts.user.deletedAt) {
        const adminUser = await prisma.user.findFirst({
          where: {
            role: { in: ['ADMIN', 'SUPER_ADMIN'] },
            deletedAt: null,
            active: true,
          },
          select: { id: true },
        })

        if (adminUser) {
          updateData.userId = adminUser.id
          reassignedCount++
          console.log(`  ↻ Reassigning timesheet ${ts.id} to admin user ${adminUser.id}`)
        } else {
          console.error(`  ❌ Cannot restore timesheet ${ts.id} - no admin user available`)
          continue
        }
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
    }
  }

  console.log('')
  console.log('='.repeat(80))
  console.log('RESTORATION SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total timesheets found: ${deletedTimesheets.length}`)
  console.log(`Successfully restored: ${restoredCount}`)
  console.log(`Reassigned to admin: ${reassignedCount}`)
  console.log(`Failed: ${deletedTimesheets.length - restoredCount}`)
  console.log('')
  console.log('Restored timesheet IDs:')
  restoredIds.forEach(id => console.log(`  - ${id}`))
  console.log('')

  // Verify restoration
  const verifyCount = await prisma.timesheet.count({
    where: {
      id: { in: restoredIds },
      deletedAt: null,
    },
  })

  console.log(`Verification: ${verifyCount} of ${restoredIds.length} timesheets are now active`)
  
  if (verifyCount === restoredIds.length) {
    console.log('✓ All timesheets successfully restored!')
  } else {
    console.log(`⚠️  Warning: Only ${verifyCount} timesheets verified as restored`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
