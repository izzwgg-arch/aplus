/**
 * SAFE USER DELETION SCRIPT
 * Deletes specific users by email address to allow email reuse
 * 
 * TARGET EMAILS (case-insensitive):
 * - Esti@apluscenterinc.org
 * - leahw@apluscenterinc.org
 * - Libbyw@apluscenterinc.org
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TARGET_EMAILS = [
  'Esti@apluscenterinc.org',
  'esti@apluscenterinc.org',
  'leahw@apluscenterinc.org',
  'Leahw@apluscenterinc.org',
  'Libbyw@apluscenterinc.org',
  'libbyw@apluscenterinc.org',
].map(email => email.toLowerCase().trim())

async function main() {
  console.log('='.repeat(80))
  console.log('USER DELETION SCRIPT - SAFE MODE')
  console.log('='.repeat(80))
  console.log(`Target emails: ${TARGET_EMAILS.join(', ')}`)
  console.log(`Started at: ${new Date().toISOString()}`)
  console.log('')

  try {
    // STEP 1: FIND USERS (READ-ONLY) - Case-insensitive search
    console.log('STEP 1: Finding users by email (case-insensitive)...')
    const emailList = TARGET_EMAILS.map(e => `'${e}'`).join(',')
    const users = await prisma.$queryRawUnsafe(`
      SELECT id, email, username, role, "deletedAt", active, "createdAt"
      FROM "User"
      WHERE LOWER(email) IN (${emailList})
    `)

    console.log(`Found ${users.length} user(s):`)
    users.forEach(user => {
      console.log(`  - ${user.email} (id=${user.id}, role=${user.role}, deletedAt=${user.deletedAt || 'null'}, active=${user.active})`)
    })
    console.log('')

    if (users.length === 0) {
      console.log('⚠️  NO USERS FOUND with these email addresses.')
      console.log('   The email conflict may be from a different source.')
      console.log('   Script will exit without making changes.')
      return
    }

    const userIds = users.map(u => u.id)

    // STEP 2: CHECK DEPENDENT RECORDS (READ-ONLY)
    console.log('STEP 2: Checking dependent records...')
    
    const [timesheets, invoices, auditLogs, notifications, activities, emailQueueItems, 
            communityInvoicesApproved, communityInvoicesRejected, communityInvoicesCreated] = await Promise.all([
      prisma.timesheet.count({ where: { userId: { in: userIds } } }),
      prisma.invoice.count({ where: { createdBy: { in: userIds } } }),
      prisma.auditLog.count({ where: { userId: { in: userIds } } }),
      prisma.notification.count({ where: { userId: { in: userIds } } }),
      prisma.activity.count({ where: { actorUserId: { in: userIds } } }),
      prisma.emailQueueItem.count({ 
        where: { 
          OR: [
            { queuedByUserId: { in: userIds } },
            { deletedByUserId: { in: userIds } },
          ]
        } 
      }),
      prisma.communityInvoice.count({ where: { approvedByUserId: { in: userIds } } }),
      prisma.communityInvoice.count({ where: { rejectedByUserId: { in: userIds } } }),
      prisma.communityInvoice.count({ where: { createdByUserId: { in: userIds } } }),
    ])

    console.log('Dependent records found:')
    console.log(`  - Timesheets: ${timesheets}`)
    console.log(`  - Invoices created: ${invoices}`)
    console.log(`  - Audit logs: ${auditLogs}`)
    console.log(`  - Notifications: ${notifications}`)
    console.log(`  - Activities: ${activities}`)
    console.log(`  - Email queue items: ${emailQueueItems}`)
    console.log(`  - Community invoices approved: ${communityInvoicesApproved}`)
    console.log(`  - Community invoices rejected: ${communityInvoicesRejected}`)
    console.log(`  - Community invoices created: ${communityInvoicesCreated}`)
    console.log('')

    // STEP 3: DELETE DEPENDENT RECORDS
    console.log('STEP 3: Deleting dependent records...')
    
    const deleteResults = await prisma.$transaction(async (tx) => {
      const results = {
        timesheets: 0,
        invoices: 0,
        notifications: 0,
        activities: 0,
        emailQueueItems: 0,
        communityInvoicesApproved: 0,
        communityInvoicesRejected: 0,
        communityInvoicesCreated: 0,
        timesheetVisibility: 0,
      }

      // Delete timesheets (if any)
      if (timesheets > 0) {
        const deleted = await tx.timesheet.deleteMany({
          where: { userId: { in: userIds } },
        })
        results.timesheets = deleted.count
        console.log(`  ✓ Deleted ${deleted.count} timesheet(s)`)
      }

      // Delete invoices created by these users
      if (invoices > 0) {
        const deleted = await tx.invoice.deleteMany({
          where: { createdBy: { in: userIds } },
        })
        results.invoices = deleted.count
        console.log(`  ✓ Deleted ${deleted.count} invoice(s)`)
      }

      // Delete notifications
      if (notifications > 0) {
        const deleted = await tx.notification.deleteMany({
          where: { userId: { in: userIds } },
        })
        results.notifications = deleted.count
        console.log(`  ✓ Deleted ${deleted.count} notification(s)`)
      }

      // Delete activities
      if (activities > 0) {
        const deleted = await tx.activity.deleteMany({
          where: { actorUserId: { in: userIds } },
        })
        results.activities = deleted.count
        console.log(`  ✓ Deleted ${deleted.count} activit(ies)`)
      }

      // Delete email queue items (set deletedByUserId to null first to avoid FK constraint)
      if (emailQueueItems > 0) {
        // First, clear the deletedByUserId references
        await tx.emailQueueItem.updateMany({
          where: { deletedByUserId: { in: userIds } },
          data: { deletedByUserId: null },
        })
        
        // Then delete items created by these users
        const deleted = await tx.emailQueueItem.deleteMany({
          where: { queuedByUserId: { in: userIds } },
        })
        results.emailQueueItems = deleted.count
        console.log(`  ✓ Deleted ${deleted.count} email queue item(s)`)
      }

      // Delete community invoices (set user references to null where nullable)
      if (communityInvoicesApproved > 0) {
        const updated = await tx.communityInvoice.updateMany({
          where: { approvedByUserId: { in: userIds } },
          data: { approvedByUserId: null },
        })
        results.communityInvoicesApproved = updated.count
        console.log(`  ✓ Cleared approvedByUserId from ${updated.count} community invoice(s)`)
      }

      if (communityInvoicesRejected > 0) {
        const updated = await tx.communityInvoice.updateMany({
          where: { rejectedByUserId: { in: userIds } },
          data: { rejectedByUserId: null },
        })
        results.communityInvoicesRejected = updated.count
        console.log(`  ✓ Cleared rejectedByUserId from ${updated.count} community invoice(s)`)
      }

      // Note: createdByUserId is required, so we delete invoices created by these users
      if (communityInvoicesCreated > 0) {
        const deleted = await tx.communityInvoice.deleteMany({
          where: { createdByUserId: { in: userIds } },
        })
        results.communityInvoicesCreated = deleted.count
        console.log(`  ✓ Deleted ${deleted.count} community invoice(s) created by these users`)
      }

      // Delete timesheet visibility records
      const timesheetVisibility = await tx.roleTimesheetVisibility.deleteMany({
        where: { userId: { in: userIds } },
      })
      results.timesheetVisibility = timesheetVisibility.count
      if (timesheetVisibility.count > 0) {
        console.log(`  ✓ Deleted ${timesheetVisibility.count} timesheet visibility record(s)`)
      }

      // Handle audit logs - find a system/admin user to reassign them to
      const systemUser = await tx.user.findFirst({
        where: {
          OR: [
            { role: 'SUPER_ADMIN' },
            { role: 'ADMIN' },
          ],
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' }, // Get oldest admin
      })

      if (systemUser && auditLogs > 0) {
        const auditLogsUpdated = await tx.auditLog.updateMany({
          where: { userId: { in: userIds } },
          data: { userId: systemUser.id }, // Reassign to system/admin user
        })
        if (auditLogsUpdated.count > 0) {
          console.log(`  ✓ Reassigned ${auditLogsUpdated.count} audit log(s) to system user (${systemUser.id})`)
        }
      } else if (auditLogs > 0 && !systemUser) {
        // If no admin user exists, we must delete audit logs to proceed
        const deleted = await tx.auditLog.deleteMany({
          where: { userId: { in: userIds } },
        })
        console.log(`  ⚠️  Deleted ${deleted.count} audit log(s) (no admin user found to reassign)`)
      }

      return results
    }, {
      timeout: 30000, // 30 second timeout
    })

    console.log('')

    // STEP 4: DELETE USER RECORDS
    console.log('STEP 4: Deleting user records...')
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    })

    console.log(`  ✓ Deleted ${deletedUsers.count} user record(s)`)
    console.log('')

    // STEP 5: VERIFY CLEANUP
    console.log('STEP 5: Verifying cleanup...')
    const remainingUsers = await prisma.user.findMany({
      where: {
        email: { in: TARGET_EMAILS },
      },
      select: {
        id: true,
        email: true,
      },
    })

    if (remainingUsers.length === 0) {
      console.log('  ✓ SUCCESS: No users found with target email addresses')
      console.log('  ✓ Email addresses are now available for reuse')
    } else {
      console.log('  ⚠️  WARNING: Found remaining users:')
      remainingUsers.forEach(user => {
        console.log(`    - ${user.email} (id=${user.id})`)
      })
    }

    // Verify no dependent records remain
    const remainingDeps = await Promise.all([
      prisma.timesheet.count({ where: { userId: { in: userIds } } }),
      prisma.invoice.count({ where: { createdBy: { in: userIds } } }),
      prisma.notification.count({ where: { userId: { in: userIds } } }),
      prisma.activity.count({ where: { actorUserId: { in: userIds } } }),
    ])

    const [remainingTimesheets, remainingInvoices, remainingNotifications, remainingActivities] = remainingDeps

    if (remainingTimesheets === 0 && remainingInvoices === 0 && 
        remainingNotifications === 0 && remainingActivities === 0) {
      console.log('  ✓ SUCCESS: No dependent records remain')
    } else {
      console.log('  ⚠️  WARNING: Some dependent records remain:')
      if (remainingTimesheets > 0) console.log(`    - ${remainingTimesheets} timesheet(s)`)
      if (remainingInvoices > 0) console.log(`    - ${remainingInvoices} invoice(s)`)
      if (remainingNotifications > 0) console.log(`    - ${remainingNotifications} notification(s)`)
      if (remainingActivities > 0) console.log(`    - ${remainingActivities} activit(ies)`)
    }

    console.log('')
    console.log('='.repeat(80))
    console.log('DELETION SUMMARY')
    console.log('='.repeat(80))
    console.log(`Users deleted: ${deletedUsers.count}`)
    users.forEach(user => {
      console.log(`  - ${user.email} (id=${user.id})`)
    })
    console.log('')
    console.log('Dependent records deleted:')
    console.log(`  - Timesheets: ${deleteResults.timesheets}`)
    console.log(`  - Invoices: ${deleteResults.invoices}`)
    console.log(`  - Notifications: ${deleteResults.notifications}`)
    console.log(`  - Activities: ${deleteResults.activities}`)
    console.log(`  - Email queue items: ${deleteResults.emailQueueItems}`)
    console.log(`  - Community invoices (cleared user refs): ${deleteResults.communityInvoicesApproved + deleteResults.communityInvoicesRejected + deleteResults.communityInvoicesCreated}`)
    console.log(`  - Timesheet visibility: ${deleteResults.timesheetVisibility}`)
    console.log('')
    console.log('Note: Audit logs were preserved for historical record')
    console.log('')
    console.log('✅ DELETION COMPLETE')
    console.log('✅ Email addresses are now available for reuse')
    console.log(`Finished at: ${new Date().toISOString()}`)
    console.log('='.repeat(80))

  } catch (error) {
    console.error('')
    console.error('='.repeat(80))
    console.error('ERROR OCCURRED')
    console.error('='.repeat(80))
    console.error(error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    console.error('')
    console.error('⚠️  No changes were committed. Database is unchanged.')
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
