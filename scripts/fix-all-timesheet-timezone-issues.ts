/**
 * Script to fix ALL timesheet entries with timezone conversion issues
 * 
 * This script:
 * 1. Finds all timesheet entries
 * 2. Checks if the stored UTC date, when converted to the timesheet's timezone, 
 *    matches what the date should be (based on the timesheet's start/end dates)
 * 3. Corrects any entries that are off by one day due to timezone conversion
 * 
 * Run with: npx tsx scripts/fix-all-timesheet-timezone-issues.ts
 */

import { PrismaClient } from '@prisma/client'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { format, subDays, addDays, isSameDay } from 'date-fns'

const prisma = new PrismaClient()

async function fixAllTimezoneIssues() {
  console.log('🔍 Finding all timesheet entries with timezone issues...\n')

  // Get all timesheets with their entries
  const allTimesheets = await prisma.timesheet.findMany({
    where: {
      deletedAt: null,
    },
    include: {
      entries: {
        orderBy: { date: 'asc' },
      },
    },
  })

  console.log(`Found ${allTimesheets.length} timesheets\n`)

  const entriesToFix: Array<{
    entry: any
    timesheet: any
    currentZonedDate: Date
    expectedDate: Date
    correctedDate: Date
    reason: string
  }> = []

  // Check each timesheet
  for (const timesheet of allTimesheets) {
    const timesheetTimezone = timesheet.timezone || 'America/New_York'
    
    // Convert timesheet start/end dates to the timesheet's timezone
    const startDateZoned = utcToZonedTime(timesheet.startDate, timesheetTimezone)
    const endDateZoned = utcToZonedTime(timesheet.endDate, timesheetTimezone)
    
    // Check each entry
    for (const entry of timesheet.entries) {
      // Convert stored UTC date to timesheet timezone
      const entryZoned = utcToZonedTime(entry.date, timesheetTimezone)
      
      // The entry date should be within the timesheet's date range
      // If the entry date is before start date or after end date, it might be wrong
      
      // Check if entry date is one day off (common timezone issue)
      // Entry dates should match the calendar day in the timesheet's timezone
      
      // Generate expected dates between start and end (excluding Saturdays)
      const expectedDates: Date[] = []
      let currentDate = new Date(startDateZoned)
      currentDate.setHours(0, 0, 0, 0)
      
      while (currentDate <= endDateZoned) {
        const dayOfWeek = currentDate.getDay()
        // Skip Saturdays
        if (dayOfWeek !== 6) {
          expectedDates.push(new Date(currentDate))
        }
        currentDate = addDays(currentDate, 1)
      }
      
      // Find the closest expected date to the entry date
      const entryDateOnly = format(entryZoned, 'yyyy-MM-dd')
      const matchingExpectedDate = expectedDates.find(expected => {
        const expectedDateOnly = format(expected, 'yyyy-MM-dd')
        return expectedDateOnly === entryDateOnly
      })
      
      // If no exact match, check if it's off by one day
      if (!matchingExpectedDate) {
        // Check if entry is one day before or after an expected date
        const entryDayBefore = subDays(entryZoned, 1)
        const entryDayAfter = addDays(entryZoned, 1)
        
        const matchBefore = expectedDates.find(expected => {
          return isSameDay(expected, entryDayBefore)
        })
        
        const matchAfter = expectedDates.find(expected => {
          return isSameDay(expected, entryDayAfter)
        })
        
        if (matchBefore) {
          // Entry is one day ahead - should be the day before
          const correctedZoned = matchBefore
          const correctedUtc = zonedTimeToUtc(correctedZoned, timesheetTimezone)
          
          entriesToFix.push({
            entry,
            timesheet,
            currentZonedDate: entryZoned,
            expectedDate: matchBefore,
            correctedDate: correctedUtc,
            reason: `Entry date ${format(entryZoned, 'yyyy-MM-dd')} is one day ahead of expected ${format(matchBefore, 'yyyy-MM-dd')}`,
          })
        } else if (matchAfter) {
          // Entry is one day behind - should be the day after
          const correctedZoned = matchAfter
          const correctedUtc = zonedTimeToUtc(correctedZoned, timesheetTimezone)
          
          entriesToFix.push({
            entry,
            timesheet,
            currentZonedDate: entryZoned,
            expectedDate: matchAfter,
            correctedDate: correctedUtc,
            reason: `Entry date ${format(entryZoned, 'yyyy-MM-dd')} is one day behind expected ${format(matchAfter, 'yyyy-MM-dd')}`,
          })
        } else {
          // Entry doesn't match any expected date - might be Saturday or completely wrong
          const dayOfWeek = entryZoned.getDay()
          if (dayOfWeek === 6) {
            // It's Saturday - convert to Sunday (previous day)
            const sundayDate = subDays(entryZoned, 1)
            const correctedUtc = zonedTimeToUtc(sundayDate, timesheetTimezone)
            
            entriesToFix.push({
              entry,
              timesheet,
              currentZonedDate: entryZoned,
              expectedDate: sundayDate,
              correctedDate: correctedUtc,
              reason: `Entry is Saturday ${format(entryZoned, 'yyyy-MM-dd')}, converting to Sunday ${format(sundayDate, 'yyyy-MM-dd')}`,
            })
          }
        }
      }
    }
  }

  console.log(`📊 Found ${entriesToFix.length} entries with timezone issues\n`)

  if (entriesToFix.length === 0) {
    console.log('✅ No timezone issues found. All entries are correct!')
    await prisma.$disconnect()
    return
  }

  // Show summary
  console.log('Summary of entries to fix:')
  const byTimesheet = new Map<string, number>()
  for (const { timesheet } of entriesToFix) {
    const count = byTimesheet.get(timesheet.id) || 0
    byTimesheet.set(timesheet.id, count + 1)
  }
  
  for (const [timesheetId, count] of byTimesheet.entries()) {
    const timesheet = entriesToFix.find(e => e.timesheet.id === timesheetId)?.timesheet
    console.log(`  Timesheet ${timesheetId} (${timesheet?.isBCBA ? 'BCBA' : 'Regular'}): ${count} entries`)
  }

  // Show first 10 entries as examples
  console.log('\nFirst 10 entries to fix:')
  entriesToFix.slice(0, 10).forEach(({ entry, currentZonedDate, expectedDate, reason }) => {
    console.log(`  Entry ${entry.id}: ${reason}`)
    console.log(`    Current: ${format(currentZonedDate, 'yyyy-MM-dd EEEE')}`)
    console.log(`    Expected: ${format(expectedDate, 'yyyy-MM-dd EEEE')}`)
  })

  console.log('\n⚠️  About to update entries. This will change dates in the database.')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Update entries
  let updated = 0
  let errors = 0

  for (const { entry, correctedDate } of entriesToFix) {
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

  // Also update all timesheets to use America/New_York timezone
  console.log('\n🔄 Updating all timesheets to use America/New_York timezone...')
  const timesheetsToUpdate = await prisma.timesheet.findMany({
    where: {
      deletedAt: null,
      timezone: { not: 'America/New_York' },
    },
  })

  if (timesheetsToUpdate.length > 0) {
    console.log(`Found ${timesheetsToUpdate.length} timesheets with non-NY timezone`)
    
    const updateResult = await prisma.timesheet.updateMany({
      where: {
        deletedAt: null,
        timezone: { not: 'America/New_York' },
      },
      data: {
        timezone: 'America/New_York',
      },
    })
    
    console.log(`✅ Updated ${updateResult.count} timesheets to use America/New_York timezone`)
  } else {
    console.log('✅ All timesheets already use America/New_York timezone')
  }

  await prisma.$disconnect()
}

// Run the script
fixAllTimezoneIssues()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
