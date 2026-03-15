/**
 * Force-approve a timesheet and queue email (admin user).
 * Usage: npx tsx scripts/approve-timesheet-direct.ts BT-1022
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const number = process.argv[2]
  if (!number) {
    console.error('Usage: npx tsx scripts/approve-timesheet-direct.ts <timesheetNumber>')
    process.exit(1)
  }

  const timesheet = await prisma.timesheet.findFirst({
    where: { timesheetNumber: number },
    include: { client: true, provider: true, bcba: true },
  })

  if (!timesheet) {
    console.error('Timesheet not found')
    process.exit(1)
  }

  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, deletedAt: null },
    select: { id: true, role: true, email: true },
  })

  if (!adminUser) {
    console.error('No admin user found')
    process.exit(1)
  }

  const timesheetId = timesheet.id
  const isBCBA = timesheet.isBCBA

  await prisma.$transaction(async (tx) => {
    await tx.timesheet.update({
      where: { id: timesheetId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        queuedAt: new Date(),
      },
    })

    const defaultRecipients =
      process.env.EMAIL_APPROVAL_RECIPIENTS ||
      'info@productivebilling.com,jacobw@apluscenterinc.org'
    const emailSubject = isBCBA
      ? 'Smart Steps ABA – BCBA Timesheet Approved'
      : 'Smart Steps ABA – Timesheet Approved'

    const reviveResult = await tx.emailQueueItem.updateMany({
      where: {
        entityType: isBCBA ? 'BCBA' : 'REGULAR',
        entityId: timesheetId,
      },
      data: {
        status: 'QUEUED',
        deletedAt: null,
        deletedByUserId: null,
        errorMessage: null,
        lastError: null,
        attempts: 0,
        queuedAt: new Date(),
        toEmail: defaultRecipients,
        subject: emailSubject,
        context: 'MAIN',
      },
    })

    if (reviveResult.count === 0) {
      await tx.emailQueueItem.create({
        data: {
          entityType: isBCBA ? 'BCBA' : 'REGULAR',
          entityId: timesheetId,
          queuedByUserId: adminUser.id,
          status: 'QUEUED',
          toEmail: defaultRecipients,
          subject: emailSubject,
          context: 'MAIN',
        },
      })
    }
  })

  console.log(`Approved ${number} (id=${timesheetId}) via ${adminUser.email}`)
}

main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
