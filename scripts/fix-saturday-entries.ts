/**
 * Script to fix existing timesheet entries that were incorrectly stored as Saturday
 * due to timezone conversion issues.
 * 
 * This script:
 * 1. Finds all timesheet entries where the date is Saturday in the timesheet's timezone
 * 2. Determines the original intended date (likely the previous day - Sunday)
 * 3. Updates the entry date to the correct date
 * 
 * Run with: npx tsx scripts/fix-saturday-entries.ts
 */

import { PrismaClient } from '@prisma/client'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { format, addDays } from 'date-fns'

const prisma = new PrismaClient()

async function fixSaturdayEntries() {
  console.log('🔍 Finding timesheet entries with Saturday dates...\n')

  // Get all BCBA timesheet entries (exclude deleted timesheets)
  const allEntries = await prisma.timesheetEntry.findMany({
    where: {
      timesheet: {
        isBCBA: true,
        deletedAt: null,
      },
    },
    include: {
      timesheet: {
        select: {
          id: true,
          timezone: true,
          startDate: true,
          endDate: true,
          isBCBA: true,
        },
      },
    },
  })

  console.log(`Found ${allEntries.length} total BCBA entries\n`)

  const saturdayEntries: Array<{
    entry: typeof allEntries[0]
    zonedDate: Date
    dayOfWeek: number
    correctedDate: Date | null
  }> = []

  // Check each entry to see if it's Saturday in the timesheet's timezone OR in UTC
  for (const entry of allEntries) {
    const timesheetTimezone = entry.timesheet.timezone || 'America/New_York'
    
    // Check both UTC and timesheet timezone
    const utcDayOfWeek = entry.date.getUTCDay()
    const zonedDate = utcToZonedTime(entry.date, timesheetTimezone)
    const zonedDayOfWeek = zonedDate.getDay() // 0 = Sunday, 6 = Saturday

    // If it's Saturday in either UTC or the timesheet timezone, we need to fix it
    if (utcDayOfWeek === 6 || zonedDayOfWeek === 6) {
      // This is Saturday - we need to figure out what the original date should be
      // Most likely, it was Sunday that got shifted to Saturday due to timezone conversion
      // But we need to check if it could be another day
      
      // Strategy: Check if the previous day (Friday) or next day (Sunday) makes more sense
      // Since Saturday is not allowed, the original was likely Sunday (day 0)
      // Sunday midnight in UTC+2/UTC+3 becomes Saturday 22:00/21:00 UTC
      
      // Saturday entries should always be converted to Sunday (the next day).
      // Sunday midnight in Israel (UTC+2/UTC+3) can appear as Saturday UTC.
      const nextDay = addDays(zonedDate, 1)
      
      let correctedDate: Date | null = null
      
      // Always convert Saturday to the next Sunday
      if (nextDay.getDay() === 0) {
        correctedDate = zonedTimeToUtc(nextDay, timesheetTimezone)
        console.log(`Entry ${entry.id}: Saturday ${format(zonedDate, 'yyyy-MM-dd')} -> Sunday ${format(nextDay, 'yyyy-MM-dd')}`)
      } else {
        // If next day is not Sunday, move forward to the next Sunday
        const daysForward = (7 - zonedDate.getDay()) % 7
        const sundayDate = addDays(zonedDate, daysForward === 0 ? 1 : daysForward)
        correctedDate = zonedTimeToUtc(sundayDate, timesheetTimezone)
        console.log(`Entry ${entry.id}: Saturday ${format(zonedDate, 'yyyy-MM-dd')} -> Sunday ${format(sundayDate, 'yyyy-MM-dd')} (adjusted)`)
      }

      saturdayEntries.push({
        entry,
        zonedDate,
        dayOfWeek: zonedDayOfWeek,
        correctedDate,
      })
      
      console.log(`  UTC day: ${utcDayOfWeek}, ${timesheetTimezone} day: ${zonedDayOfWeek}`)
    }
  }

  console.log(`\n📊 Found ${saturdayEntries.length} entries with Saturday dates\n`)

  if (saturdayEntries.length === 0) {
    console.log('✅ No Saturday entries found. Nothing to fix!')
    await prisma.$disconnect()
    return
  }

  // Show summary
  console.log('Summary of entries to fix:')
  const byTimesheet = new Map<string, number>()
  for (const { entry } of saturdayEntries) {
    const count = byTimesheet.get(entry.timesheetId) || 0
    byTimesheet.set(entry.timesheetId, count + 1)
  }
  
  for (const [timesheetId, count] of byTimesheet.entries()) {
    const timesheet = saturdayEntries.find(s => s.entry.timesheetId === timesheetId)?.entry.timesheet
    console.log(`  Timesheet ${timesheetId} (${timesheet?.isBCBA ? 'BCBA' : 'Regular'}): ${count} entries`)
  }

  console.log('\n⚠️  About to update entries. This will change dates in the database.')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Update entries
  let updated = 0
  let errors = 0

  for (const { entry, correctedDate } of saturdayEntries) {
    if (!correctedDate) {
      console.error(`❌ No corrected date for entry ${entry.id}`)
      errors++
      continue
    }

    try {
      await prisma.timesheetEntry.update({
        where: { id: entry.id },
        data: { date: correctedDate },
      })
      updated++
    } catch (error) {
      console.error(`❌ Error updating entry ${entry.id}:`, error)
      errors++
    }
  }

  console.log(`\n✅ Fixed ${updated} entries`)
  if (errors > 0) {
    console.log(`❌ ${errors} errors occurred`)
  }

  await prisma.$disconnect()
}

// Run the script
fixSaturdayEntries()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
