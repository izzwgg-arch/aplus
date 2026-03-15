const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('DELETING REMAINING SOFT-DELETED USER')
  console.log('='.repeat(80))
  
  // Find the user with case-insensitive email match
  const user = await prisma.user.findFirst({
    where: {
      email: {
        contains: 'leahw',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      email: true,
      username: true,
      deletedAt: true,
      active: true,
    },
  })

  if (!user) {
    console.log('No user found with "leahw" in email')
    await prisma.$disconnect()
    return
  }

  console.log(`Found user: ${user.email} (id=${user.id}, deletedAt=${user.deletedAt || 'null'})`)
  console.log('')

  // Check dependent records
  const [timesheets, invoices, auditLogs, notifications, activities, emailQueueItems] = await Promise.all([
    prisma.timesheet.count({ where: { userId: user.id } }),
    prisma.invoice.count({ where: { createdBy: user.id } }),
    prisma.auditLog.count({ where: { userId: user.id } }),
    prisma.notification.count({ where: { userId: user.id } }),
    prisma.activity.count({ where: { actorUserId: user.id } }),
    prisma.emailQueueItem.count({ 
      where: { 
        OR: [
          { queuedByUserId: user.id },
          { deletedByUserId: user.id },
        ]
      } 
    }),
  ])

  console.log('Dependent records:')
  console.log(`  - Timesheets: ${timesheets}`)
  console.log(`  - Invoices: ${invoices}`)
  console.log(`  - Audit logs: ${auditLogs}`)
  console.log(`  - Notifications: ${notifications}`)
  console.log(`  - Activities: ${activities}`)
  console.log(`  - Email queue items: ${emailQueueItems}`)
  console.log('')

  // Delete in transaction
  await prisma.$transaction(async (tx) => {
    // Delete dependent records
    if (timesheets > 0) {
      await tx.timesheet.deleteMany({ where: { userId: user.id } })
      console.log(`  ✓ Deleted ${timesheets} timesheet(s)`)
    }
    if (invoices > 0) {
      await tx.invoice.deleteMany({ where: { createdBy: user.id } })
      console.log(`  ✓ Deleted ${invoices} invoice(s)`)
    }
    if (notifications > 0) {
      await tx.notification.deleteMany({ where: { userId: user.id } })
      console.log(`  ✓ Deleted ${notifications} notification(s)`)
    }
    if (activities > 0) {
      await tx.activity.deleteMany({ where: { actorUserId: user.id } })
      console.log(`  ✓ Deleted ${activities} activit(ies)`)
    }
    if (emailQueueItems > 0) {
      await tx.emailQueueItem.updateMany({
        where: { deletedByUserId: user.id },
        data: { deletedByUserId: null },
      })
      await tx.emailQueueItem.deleteMany({ where: { queuedByUserId: user.id } })
      console.log(`  ✓ Deleted ${emailQueueItems} email queue item(s)`)
    }

    // Reassign audit logs to system user
    if (auditLogs > 0) {
      const systemUser = await tx.user.findFirst({
        where: {
          OR: [
            { role: 'SUPER_ADMIN' },
            { role: 'ADMIN' },
          ],
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })

      if (systemUser) {
        await tx.auditLog.updateMany({
          where: { userId: user.id },
          data: { userId: systemUser.id },
        })
        console.log(`  ✓ Reassigned ${auditLogs} audit log(s) to system user`)
      } else {
        await tx.auditLog.deleteMany({ where: { userId: user.id } })
        console.log(`  ⚠️  Deleted ${auditLogs} audit log(s) (no admin user found)`)
      }
    }

    // Delete user
    await tx.user.delete({
      where: { id: user.id },
    })
    console.log(`  ✓ Deleted user: ${user.email}`)
  })

  console.log('')
  console.log('✅ DELETION COMPLETE')
  console.log(`✅ Email ${user.email} is now available for reuse`)
  console.log('='.repeat(80))

  await prisma.$disconnect()
}

main().catch(console.error)
