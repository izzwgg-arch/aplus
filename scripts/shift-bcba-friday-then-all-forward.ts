/**
 * 1) Shift BCBA entries that are Friday -> Saturday (in timesheet timezone)
 * 2) Shift all BCBA entries forward by one day
 *
 * Run with: npx tsx scripts/shift-bcba-friday-then-all-forward.ts
 */
import { PrismaClient } from '@prisma/client'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { addDays, format } from 'date-fns'

const prisma = new PrismaClient()

async function shiftFridayThenAllForward() {
  console.log('⏩ Step 1: Shifting BCBA Friday entries -> Saturday...\n')

  const fridayEntries = await prisma.timesheetEntry.findMany({
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

  let fridayUpdated = 0
  for (const entry of fridayEntries) {
    const tz = entry.timesheet.timezone || 'America/New_York'
    const zonedDate = utcToZonedTime(entry.date, tz)
    if (zonedDate.getDay() !== 5) continue // 5 = Friday

    const correctedZoned = addDays(zonedDate, 1)
    const correctedUtc = zonedTimeToUtc(correctedZoned, tz)

    await prisma.timesheetEntry.update({
      where: { id: entry.id },
      data: { date: correctedUtc },
    })
    fridayUpdated++
    if (fridayUpdated <= 5) {
      console.log(
        `Entry ${entry.id}: ${format(zonedDate, 'yyyy-MM-dd')} -> ${format(correctedZoned, 'yyyy-MM-dd')} (${tz})`
      )
    }
  }

  console.log(`\n✅ Friday -> Saturday updated: ${fridayUpdated}\n`)

  console.log('⏩ Step 2: Shifting ALL BCBA entries forward by one day...\n')

  const allEntries = await prisma.timesheetEntry.findMany({
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

  let updated = 0
  for (const entry of allEntries) {
    const tz = entry.timesheet.timezone || 'America/New_York'
    const zonedDate = utcToZonedTime(entry.date, tz)
    const newZonedDate = addDays(zonedDate, 1)
    const newUtcDate = zonedTimeToUtc(newZonedDate, tz)

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
  }

  console.log(`\n✅ All BCBA entries shifted forward: ${updated}`)
  await prisma.$disconnect()
}

shiftFridayThenAllForward().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
