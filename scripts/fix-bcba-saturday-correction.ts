/**
 * Correct BCBA entries that were incorrectly shifted to Friday
 * by the previous Saturday-fix run. Moves them forward to Sunday
 * in the timesheet's timezone.
 *
 * Run with: npx tsx scripts/fix-bcba-saturday-correction.ts
 */
import { PrismaClient } from '@prisma/client'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { addDays, format } from 'date-fns'

const prisma = new PrismaClient()

const ENTRY_IDS = [
  'cml8fj550000wqcwl0sqlucd5',
  'cml8folj1001cqcwlkfy60g4z',
  'cml8fkn7z0011qcwlh1ff6vk8',
  'cml8furl1001oqcwl4ic0xzfb',
]

async function fixSpecificEntries() {
  console.log('🔧 Correcting BCBA entries shifted to Friday...\n')

  const entries = await prisma.timesheetEntry.findMany({
    where: { id: { in: ENTRY_IDS } },
    include: {
      timesheet: {
        select: { timezone: true },
      },
    },
  })

  if (entries.length === 0) {
    console.log('✅ No matching entries found. Nothing to fix.')
    await prisma.$disconnect()
    return
  }

  let updated = 0
  for (const entry of entries) {
    const tz = entry.timesheet.timezone || 'America/New_York'
    const zonedDate = utcToZonedTime(entry.date, tz)
    const day = zonedDate.getDay() // 0=Sun, 5=Fri

    if (day !== 5) {
      console.log(`Skipping ${entry.id}: not Friday in ${tz} (${format(zonedDate, 'yyyy-MM-dd')})`)
      continue
    }

    // Move Friday -> Sunday (add 2 days)
    const correctedZoned = addDays(zonedDate, 2)
    const correctedUtc = zonedTimeToUtc(correctedZoned, tz)

    await prisma.timesheetEntry.update({
      where: { id: entry.id },
      data: { date: correctedUtc },
    })
    updated++
    console.log(
      `Entry ${entry.id}: ${format(zonedDate, 'yyyy-MM-dd')} -> ${format(correctedZoned, 'yyyy-MM-dd')} (${tz})`
    )
  }

  console.log(`\n✅ Corrected ${updated} entries`)
  await prisma.$disconnect()
}

fixSpecificEntries().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
