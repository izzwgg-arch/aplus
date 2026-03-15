const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Verifying restored timesheets...')
  console.log('')

  const restoredIds = [
    'cmkak279u001r12rzudxr42c1',
    'cmkajvplu001812rzade7tyf5',
    'cmkajkcyo000s12rzis7s0iwx',
    'cmkaj245l000212rzm3bbn5m8',
    'cmkafuspi00016gioae2kh68l',
    'cmka0qx5e0005154n3otiyirc',
  ]

  const timesheets = await prisma.timesheet.findMany({
    where: {
      id: { in: restoredIds },
    },
    include: {
      user: {
        select: { id: true, email: true, username: true, deletedAt: true },
      },
      entries: true,
      client: {
        select: { name: true },
      },
      provider: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Found ${timesheets.length} timesheet(s):`)
  console.log('')

  let activeCount = 0
  let deletedCount = 0

  timesheets.forEach(ts => {
    const status = ts.deletedAt ? '❌ DELETED' : '✓ ACTIVE'
    if (ts.deletedAt) {
      deletedCount++
    } else {
      activeCount++
    }

    console.log(`${status} - ${ts.id}`)
    console.log(`  Created: ${ts.createdAt}`)
    console.log(`  Status: ${ts.status}`)
    console.log(`  User: ${ts.user?.email || ts.userId} ${ts.user?.deletedAt ? '(DELETED USER)' : ''}`)
    console.log(`  Client: ${ts.client?.name || 'N/A'}`)
    console.log(`  Provider: ${ts.provider?.name || 'N/A'}`)
    console.log(`  Entries: ${ts.entries.length}`)
    if (ts.deletedAt) {
      console.log(`  Deleted At: ${ts.deletedAt}`)
    }
    console.log('')
  })

  console.log('='.repeat(80))
  console.log('VERIFICATION SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total timesheets checked: ${timesheets.length}`)
  console.log(`Active (restored): ${activeCount}`)
  console.log(`Still deleted: ${deletedCount}`)
  console.log('')

  if (activeCount === restoredIds.length) {
    console.log('✓ All timesheets are active and should be visible in the system!')
  } else {
    console.log(`⚠️  Warning: ${deletedCount} timesheet(s) are still deleted`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
