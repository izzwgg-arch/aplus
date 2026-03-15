/**
 * Check a timesheet by timesheetNumber.
 * Usage: npx tsx scripts/check-timesheet.ts BT-1022
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const number = process.argv[2]
  if (!number) {
    console.error('Usage: npx tsx scripts/check-timesheet.ts <timesheetNumber>')
    process.exit(1)
  }

  const t = await prisma.timesheet.findFirst({
    where: { timesheetNumber: number },
    include: {
      client: true,
      provider: true,
      bcba: true,
    },
  })

  const emailQueueItems = t
    ? await prisma.emailQueueItem.findMany({
        where: {
          entityId: t.id,
          entityType: t.isBCBA ? 'BCBA' : 'REGULAR',
        },
      })
    : []

  console.log(
    JSON.stringify(
      {
        id: t?.id,
        status: t?.status,
        approvedAt: t?.approvedAt,
        queuedAt: t?.queuedAt,
        emailedAt: t?.emailedAt,
        invoicedAt: t?.invoicedAt,
        invoiceId: t?.invoiceId,
        isBCBA: t?.isBCBA,
        deletedAt: t?.deletedAt,
        client: t?.client ? { id: t.client.id, name: t.client.name, deletedAt: t.client.deletedAt } : null,
        provider: t?.provider ? { id: t.provider.id, name: t.provider.name, deletedAt: t.provider.deletedAt } : null,
        bcba: t?.bcba ? { id: t.bcba.id, name: t.bcba.name, deletedAt: t.bcba.deletedAt } : null,
        emailQueueItems: (emailQueueItems || []).map((i) => ({
          id: i.id,
          status: i.status,
          deletedAt: i.deletedAt,
          context: i.context,
          entityType: i.entityType,
          entityId: i.entityId,
        })),
      },
      null,
      2
    )
  )

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
