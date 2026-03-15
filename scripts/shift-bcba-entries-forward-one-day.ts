/**
 * Shift all BCBA timesheet entry dates forward by one day.
 *
 * Run with: npx tsx scripts/shift-bcba-entries-forward-one-day.ts
 */
import { PrismaClient } from '@prisma/client'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { addDays, format } from 'date-fns'

const prisma = new PrismaClient()

async function shiftAllBcbaEntries() {
  console.log('⏩ Shifting all BCBA timesheet entry dates forward by one day...\n')

  const entries = await prisma.timesheetEntry.findMany({
    where: {
      timesheet: {
        isBCBA: true,
        deletedAt: null,
      },
    },
    include: {
      timesheet: {
        select: { timezone: true },
      },
    },
  })

  console.log(`Found ${entries.length} BCBA entries\n`)

  let updated = 0
  let errors = 0

  for (const entry of entries) {
    const tz = entry.timesheet.timezone || 'America/New_York'
    const zonedDate = utcToZonedTime(entry.date, tz)
    const newZonedDate = addDays(zonedDate, 1)
    const newUtcDate = zonedTimeToUtc(newZonedDate, tz)

    try {
      await prisma.timesheetEntry.update({
        where: { id: entry.id },
        data: { date: newUtcDate },
      })
      updated++

      if (updated <= 5) {
        console.log(
          `Entry ${entry.id}: ${format(zonedDate, 'yyyy-MM-dd')} -> ${format(newZonedDate, 'yyyy-MM-dd')} (${tz})`
        )
      }
    } catch (error) {
      console.error(`❌ Error updating entry ${entry.id}:`, error)
      errors++
    }
  }

  console.log(`\n✅ Updated ${updated} entries`)
  if (errors > 0) {
    console.log(`❌ ${errors} errors occurred`)
  }

  await prisma.$disconnect()
}

shiftAllBcbaEntries().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
